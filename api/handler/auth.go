package handler

import (
	"github.com/kalmhq/kalm/api/resources"
	"net/http"

	"github.com/kalmhq/kalm/api/auth"
	"github.com/labstack/echo/v4"
	authorizationV1 "k8s.io/api/authorization/v1"
	"k8s.io/client-go/kubernetes"
)

type LoginStatusResponse struct {
	Authorized bool   `json:"authorized"`
	IsAdmin    bool   `json:"isAdmin"`
	Entity     string `json:"entity"`
	CSRF       string `json:"csrf"`
}

func (h *ApiHandler) handleValidateToken(c echo.Context) error {
	authInfo, err := auth.GetAuthInfo(c)
	if err != nil {
		return err
	}
	err = h.clientManager.IsAuthInfoWorking(authInfo)
	if err != nil {
		return err
	}
	return c.NoContent(http.StatusOK)
}

// This handler is for frontend to know if it's authorized.
// The kalm api server may be behind some proxies that will provide auth info for the client.
func (h *ApiHandler) handleLoginStatus(c echo.Context) error {
	clientInfo, err := h.clientManager.GetConfigForClientRequestContext(c)

	var res LoginStatusResponse

	if err != nil {
		return c.JSON(http.StatusOK, res)
	}

	k8sClient, err := kubernetes.NewForConfig(clientInfo.Cfg)
	if err != nil {
		return c.JSON(http.StatusOK, res)
	}

	_, err = k8sClient.ServerVersion()

	if err != nil {
		return c.JSON(http.StatusOK, res)
	}

	// Check if current user is an admin. Any better solution?
	review := &authorizationV1.SelfSubjectAccessReview{
		Spec: authorizationV1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationV1.ResourceAttributes{
				Namespace: "",
				Resource:  "clusterrolebindings",
				Verb:      "create",
			},
		},
	}

	builder := resources.NewBuilder(clientInfo.Cfg, h.logger)
	err = builder.Create(review)

	if err != nil {
		return err
	}

	res.Entity = clientInfo.Name
	res.IsAdmin = review.Status.Allowed
	res.Authorized = review.Status.Allowed

	return c.JSON(http.StatusOK, res)
}
