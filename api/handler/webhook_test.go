package handler

import (
	"github.com/kalmhq/kalm/controller/api/v1alpha1"
	"github.com/stretchr/testify/suite"
	metaV1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/rand"
	"net/http"
	"testing"
)

type WebhookHandlerTestSuite struct {
	WithControllerTestSuite
	namespace string
}

func (suite *WebhookHandlerTestSuite) SetupSuite() {
	suite.WithControllerTestSuite.SetupSuite()
	suite.namespace = "kalm-system"
	suite.ensureNamespaceExist(suite.namespace)
}

func (suite *WebhookHandlerTestSuite) TestWebhookHandler() {
	// create component
	component := v1alpha1.Component{
		ObjectMeta: metaV1.ObjectMeta{
			Name:      "test-webhook",
			Namespace: suite.namespace,
		},
		Spec: v1alpha1.ComponentSpec{
			WorkloadType: "server",
			Image:        "nginx:latest",
		},
	}
	err := suite.Create(&component)
	suite.Nil(err)

	// create access token
	token := rand.String(64)

	accessToken := &v1alpha1.AccessToken{
		ObjectMeta: metaV1.ObjectMeta{
			Name: v1alpha1.GetAccessTokenNameFromToken(token),
		},
		Spec: v1alpha1.AccessTokenSpec{
			Subject: token,
			Token:   rand.String(64),
			Rules: []v1alpha1.AccessTokenRule{
				{
					Verb:      "manage",
					Namespace: "*",
					Name:      "*",
					Kind:      "*",
				},
			},
			Creator: "test",
		},
	}
	err = suite.Create(accessToken)
	suite.Nil(err)

	deployWebhookCallParams := DeployWebhookCallParams{
		Namespace:     suite.namespace,
		ComponentName: "test-webhook",
		ImageTag:      "image-tag",
	}

	suite.DoTestRequest(&TestRequestContext{
		User: accessToken.Name,
		Roles: []string{
			GetEditorRoleOfNs(suite.namespace),
		},
		Namespace: suite.namespace,
		Method:    http.MethodPost,
		Path:      "/webhook/components",
		Body:      deployWebhookCallParams,
		TestWithoutRoles: func(rec *ResponseRecorder) {
			suite.IsMissingRoleError(rec, "editor", suite.namespace)
		},
		TestWithRoles: func(rec *ResponseRecorder) {
			suite.NotNil(rec)
			suite.EqualValues(200, rec.Code)
		},
	})
}

func TestWebhookHandlerTestSuite(t *testing.T) {
	suite.Run(t, new(WebhookHandlerTestSuite))
}
