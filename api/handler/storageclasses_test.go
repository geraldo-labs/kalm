package handler

import (
	"github.com/stretchr/testify/suite"
	v1 "k8s.io/api/storage/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"net/http"
	"testing"
)

type StorageclassesHandlerTestSuite struct {
	WithControllerTestSuite
}

func (suite *StorageclassesHandlerTestSuite) SetupSuite() {
	suite.WithControllerTestSuite.SetupSuite()
}

func (suite *StorageclassesHandlerTestSuite) TestStorageclassesHandler() {
	storageClassDefault := v1.StorageClass{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-storage-class-default",
		},
		Provisioner: "kubernetes.io/gce-pd",
	}
	err := suite.Create(&storageClassDefault)
	suite.Nil(err)

	storageClassKalm := v1.StorageClass{
		ObjectMeta: metav1.ObjectMeta{
			Labels: map[string]string{
				"kalm-managed": "true",
			},
			Name: "test-storage-class",
			Annotations: map[string]string{
				"kalm-annotation-sc-doc-link":   "https://cloud.google.com/compute/docs/disks#pdspecs",
				"kalm-annotation-sc-price-link": "https://cloud.google.com/compute/disks-image-pricing#disk",
			},
		},
		Parameters: map[string]string{
			"type": "pd-ssd",
		},
		Provisioner: "kubernetes.io/gce-pd",
	}
	err = suite.Create(&storageClassKalm)
	suite.Nil(err)

	var storageClasses []*StorageClass
	rec := suite.NewRequest(http.MethodGet, "/v1alpha1/storageclasses", "")
	rec.BodyAsJSON(&storageClasses)

	suite.EqualValues(200, rec.Code)
	suite.EqualValues(2, len(storageClasses))
	suite.EqualValues("test-storage-class", storageClasses[0].Name)
	suite.EqualValues("test-storage-class-default", storageClasses[1].Name)
}

func TestStorageclassesHandlerTestSuite(t *testing.T) {
	suite.Run(t, new(StorageclassesHandlerTestSuite))
}
