# GAIOL - build and run from repo root
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOMOD=$(GOCMD) mod

.PHONY: build run test deps clean

build:
	$(GOBUILD) -o web-server.exe ./cmd/web-server/

run: build
	./web-server.exe

test:
	$(GOTEST) -v ./...

deps:
	$(GOMOD) download
	$(GOMOD) tidy

clean:
	$(GOCMD) clean
	rm -f web-server.exe
