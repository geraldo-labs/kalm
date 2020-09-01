package handler

import (
	"github.com/kalmhq/kalm/api/resources"
	"github.com/labstack/echo/v4"
)

func (h *ApiHandler) handleListAccessTokens(c echo.Context) error {
	if !h.clientManager.CanViewCluster(getCurrentUser(c)) {
		return resources.NoClusterViewerRoleError
	}

	keys, err := h.builder.GetAccessTokens(c.Param("namespace"))

	if err != nil {
		return err
	}

	return c.JSON(200, keys)
}

func (h *ApiHandler) handleCreateAccessToken(c echo.Context) error {
	if !h.clientManager.CanEditCluster(getCurrentUser(c)) {
		return resources.NoClusterEditorRoleError
	}

	accessToken, err := getAccessTokenFromContext(c)
	if err != nil {
		return err
	}

	accessToken, err = h.builder.CreateAccessToken(accessToken)
	if err != nil {
		return err
	}

	return c.JSON(201, accessToken)
}

func (h *ApiHandler) handleDeleteAccessToken(c echo.Context) error {
	if !h.clientManager.CanEditCluster(getCurrentUser(c)) {
		return resources.NoClusterEditorRoleError
	}

	accessToken, err := getAccessTokenFromContext(c)

	if err != nil {
		return err
	}

	if err := h.builder.DeleteAccessToken(accessToken.Name); err != nil {
		return err
	}

	return c.NoContent(200)
}

func getAccessTokenFromContext(c echo.Context) (*resources.AccessToken, error) {
	var accessToken resources.AccessToken

	if err := c.Bind(&accessToken); err != nil {
		return nil, err
	}

	return &accessToken, nil
}
