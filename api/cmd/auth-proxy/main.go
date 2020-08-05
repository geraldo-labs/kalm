package main

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/coreos/go-oidc"
	"github.com/kalmhq/kalm/api/log"
	"github.com/kalmhq/kalm/api/server"
	"github.com/kalmhq/kalm/api/utils"
	"github.com/labstack/echo/v4"
	"golang.org/x/oauth2"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
)

var oauth2Config *oauth2.Config
var oauth2ConfigMut = &sync.Mutex{}

var stateEncryptKey [16]byte
var oidcVerifier *oidc.IDTokenVerifier

var authProxyURL string
var clientSecret string

const ID_TOKEN_COOKIE_NAME = "id_token"
const ID_TOKEN_QUERY_NAME = "id_token"

const ENVOY_EXT_AUTH_PATH_PREFIX = "ext_authz"

// CSRF protection and pass payload
type OauthState struct {
	Nonce       string
	OriginalURL string
}

func getOauth2Config() *oauth2.Config {
	if oauth2Config != nil {
		return oauth2Config
	}

	oauth2ConfigMut.Lock()
	defer oauth2ConfigMut.Unlock()

	if oauth2Config != nil {
		return oauth2Config
	}

	clientID := os.Getenv("KALM_OIDC_CLIENT_ID")
	clientSecret = os.Getenv("KALM_OIDC_CLIENT_SECRET")
	oidcProviderUrl := os.Getenv("KALM_OIDC_PROVIDER_URL")
	authProxyURL = os.Getenv("KALM_OIDC_AUTH_PROXY_URL")

	if clientID == "" || clientSecret == "" || oidcProviderUrl == "" || authProxyURL == "" {
		log.Error(nil, "KALM OIDC ENVs are not configured")
		return nil
	}

	stateEncryptKey = md5.Sum([]byte(clientSecret))
	provider, err := oidc.NewProvider(context.Background(), oidcProviderUrl)

	if err != nil {
		log.Error(err,"KALM new provider failed.")
		return nil
	}

	oidcVerifier = provider.Verifier(&oidc.Config{ClientID: clientID})

	scopes := []string{}
	scopes = append(scopes, oidc.ScopeOpenID, "profile", "email", "groups")

	oauth2Config = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
		RedirectURL:  authProxyURL + "/oidc/callback",
	}

	return oauth2Config
}

func removeExtAuthPathPrefix(path string) string {
	if strings.HasPrefix(path, "/"+ENVOY_EXT_AUTH_PATH_PREFIX) {
		// remove prefix "/" + ENVOY_EXT_AUTH_PATH_PREFIX
		path = path[len(ENVOY_EXT_AUTH_PATH_PREFIX)+1:]
	}

	if path == "" {
		path = "/"
	}

	return path
}

func getOriginalURL(c echo.Context) string {
	requestURI := removeExtAuthPathPrefix(c.Request().RequestURI)
	ur := fmt.Sprintf("%s://%s%s", c.Scheme(), c.Request().Host, requestURI)
	log.Debug("original url ", ur)
	return ur
}
func getStringSignature(data string) string {
	signBytes := sha256.Sum256(append([]byte(data), []byte(clientSecret)...))
	signString := base64.RawStdEncoding.EncodeToString(signBytes[:])
	return signString
}

func redirectToAuthProxyUrl(c echo.Context) error {
	originalURL := getOriginalURL(c)
	uri, err := url.Parse(authProxyURL + "/oidc/login")

	if err != nil {
		log.Error(err, "parse auth proxy url error.")
		return err
	}

	params := uri.Query()
	params.Add("original_url", originalURL)
	params.Add("sign", getStringSignature(originalURL))

	uri.RawQuery = params.Encode()

	return c.Redirect(302, uri.String())
}

///////////////////////////////////
// Run as Envoy ext_authz filter //
///////////////////////////////////

func handleExtAuthz(c echo.Context) error {
	if getOauth2Config() == nil {
		return c.String(503, "Please configure KALM OIDC environments.")
	}

	// if there is authorization header, skip the ext authz
	// envoy jwt_authn will handle the reset logic
	if c.Request().Header.Get(echo.HeaderAuthorization) != "" {
		return c.NoContent(200)
	}

	if c.QueryParam(ID_TOKEN_QUERY_NAME) != "" {
		return handleSetIDToken(c)
	}

	cookie, err := c.Cookie(ID_TOKEN_COOKIE_NAME)

	if err != nil {
		log.Info("No auth cookie, redirect to auth proxy", "ip", c.RealIP(), "path", c.Path())
		return redirectToAuthProxyUrl(c)
	}

	if cookie.Value == "" {
		log.Info("Auth cookie value empty, redirect to auth proxy", "ip", c.RealIP(), "path", c.Path())
		return redirectToAuthProxyUrl(c)
	}

	_, err = oidcVerifier.Verify(context.Background(), cookie.Value)

	if err != nil {
		log.Error(err, "jwt verify failed")
		cookie.Value = ""
		c.SetCookie(cookie)
		return redirectToAuthProxyUrl(c)
	}

	c.Response().Header().Set(echo.HeaderAuthorization, "Bearer "+cookie.Value)
	return c.NoContent(200)
}

func handleSetIDToken(c echo.Context) error {
	rawIDToken := c.QueryParam(ID_TOKEN_QUERY_NAME)
	idToken, err := oidcVerifier.Verify(context.Background(), rawIDToken)

	if err != nil {
		log.Error(err, "jwt verify failed")
		return c.String(400, "jwt verify failed")
	}

	cookie := new(http.Cookie)
	cookie.Name = ID_TOKEN_COOKIE_NAME
	cookie.Value = rawIDToken
	cookie.Expires = idToken.Expiry
	cookie.HttpOnly = true
	cookie.SameSite = http.SameSiteLaxMode
	cookie.Path = "/"
	c.SetCookie(cookie)

	uri := c.Request().URL
	params := uri.Query()
	params.Del(ID_TOKEN_QUERY_NAME)
	uri.RawQuery = params.Encode()
	uri.Path = removeExtAuthPathPrefix(uri.Path)

	return c.Redirect(302, uri.String())
}

///////////////////////
// Run as Auth proxy //
///////////////////////

func handleOIDCLogin(c echo.Context) error {
	if getOauth2Config() == nil {
		return c.String(503, "Please configure KALM OIDC environments.")
	}

	// verify request
	originalURL := c.QueryParam("original_url")

	if originalURL == "" {
		return c.String(400, "Require original_url.")
	}

	sign := c.QueryParam("sign")

	if sign == "" {
		return c.String(400, "Require sign.")
	}

	if sign != getStringSignature(originalURL) {
		log.Error(nil, "wrong sign", "receive", sign, "expected", getStringSignature(originalURL))
		return c.String(400, "Wrong sign")
	}

	state := &OauthState{
		Nonce:       utils.RandString(16),
		OriginalURL: originalURL,
	}

	stateBytes := new(bytes.Buffer)
	err := json.NewEncoder(stateBytes).Encode(state)

	if err != nil {
		return err
	}

	encryptedState, err := utils.AesEncrypt(stateBytes.Bytes(), stateEncryptKey[:])

	if err != nil {
		return err
	}

	return c.Redirect(
		302,
		oauth2Config.AuthCodeURL(
			base64.RawStdEncoding.EncodeToString(encryptedState),
		),
	)
}

// this handler run under dashboard api domain
func handleOIDCCallback(c echo.Context) error {
	if getOauth2Config() == nil {
		return c.String(503, "Please configure KALM OIDC environments.")
	}

	code := c.QueryParam("code")

	stateStr := c.QueryParam("state")

	if stateStr == "" {
		log.Error(nil,"missing state")
		return c.String(400, "Missing state")
	}

	stateBytes, err := base64.RawStdEncoding.DecodeString(stateStr)

	if err != nil {
		log.Error(err,"Base64 decode state failed")
		return c.String(400, "Base64 decode state failed")
	}

	stateJsonBytes, err := utils.AesDecrypt(stateBytes, stateEncryptKey[:])

	if err != nil {
		log.Error(err, "Aes decrypted state failed")
		return c.String(400, "State mismatch")
	}

	var state OauthState
	err = json.Unmarshal(stateJsonBytes, &state)

	if err != nil {
		log.Error(err, "json decode state failed")
		return c.String(400, "json decode state failed")
	}

	oauth2Token, err := oauth2Config.Exchange(
		context.Background(),
		code,
	)

	if err != nil {
		log.Error(err, "Exchange oauth2Token error")
		return c.String(400, "Exchange oauth2Token error")
	}

	rawIDToken, ok := oauth2Token.Extra(ID_TOKEN_COOKIE_NAME).(string)

	if !ok {
		log.Error(nil,"no id_token in token response")
		return c.String(400, "no id_token in token resonse")
	}

	_, err = oidcVerifier.Verify(context.Background(), rawIDToken)

	if err != nil {
		log.Error(err, "jwt verify failed")
		return c.String(400, "jwt verify failed")
	}

	uri, err := url.Parse(state.OriginalURL)

	if err != nil {
		log.Error(err, "parse original url failed. ", "OriginalURL", state.OriginalURL)
		return c.String(400, "parse original url failed.")
	}

	params := uri.Query()
	params.Add(ID_TOKEN_QUERY_NAME, rawIDToken)
	uri.RawQuery = params.Encode()

	return c.Redirect(302, uri.String())
}

func main() {
	e := server.NewEchoInstance()

	// oidc auth proxy handlers
	e.GET("/oidc/login", handleOIDCLogin)
	e.GET("/oidc/callback", handleOIDCCallback)

	// envoy ext_authz handlers
	e.GET("/"+ENVOY_EXT_AUTH_PATH_PREFIX+"/*", handleExtAuthz)
	e.GET("/"+ENVOY_EXT_AUTH_PATH_PREFIX, handleExtAuthz)

	err := e.Start("0.0.0.0:3002")
	if err != nil {
		panic(err)
	}
}
