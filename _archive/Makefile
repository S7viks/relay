# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod
BINARY_NAME=gaiol
VERSION=1.0.0

# Build directories
BUILD_DIR=build
BINARY_UNIX=$(BUILD_DIR)/$(BINARY_NAME)_unix
BINARY_WIN=$(BUILD_DIR)/$(BINARY_NAME).exe

# Source files
SOURCES=$(shell find . -name "*.go")

.PHONY: all build clean test coverage deps lint run

all: test build

build:
	mkdir -p $(BUILD_DIR)
	$(GOBUILD) -o $(BINARY_UNIX) ./cmd/uaip-service
	GOOS=windows GOARCH=amd64 $(GOBUILD) -o $(BINARY_WIN) ./cmd/uaip-service

clean:
	$(GOCLEAN)
	rm -rf $(BUILD_DIR)

test:
	$(GOTEST) -v ./...

coverage:
	$(GOTEST) -coverprofile=coverage.out ./...
	$(GOCMD) tool cover -html=coverage.out

deps:
	$(GOMOD) download
	$(GOMOD) tidy

lint:
	golangci-lint run

run:
	$(GOBUILD) -o $(BINARY_UNIX) ./cmd/uaip-service
	./$(BINARY_UNIX)

# Docker commands
docker-build:
	docker build -t gaiol:$(VERSION) .

docker-run:
	docker run -p 8080:8080 gaiol:$(VERSION)

# Database commands
migrate-up:
	go run cmd/migrate/main.go up

migrate-down:
	go run cmd/migrate/main.go down

# Development tools
tools:
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install github.com/golang/mock/mockgen@latest
