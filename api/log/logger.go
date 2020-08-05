package log

import (
	"github.com/go-logr/logr"
	"go.uber.org/zap/zapcore"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
)

var (
	defaultLogger = zap.New(func(o *zap.Options) {
		o.Development = true
		o.Level = zapcore.InfoLevel
	})
)

func DefaultLogger() logr.Logger {
	return defaultLogger
}

func Debug(msg string, keysAndValues ...interface{}) {
	defaultLogger.V(1).Info(msg, keysAndValues...)
}

func Info(msg string, keysAndValues ...interface{}) {
	defaultLogger.Info(msg, keysAndValues...)
}

func Error(err error, msg string, keysAndValues ...interface{}) {
	defaultLogger.Error(err, msg, keysAndValues...)
}
