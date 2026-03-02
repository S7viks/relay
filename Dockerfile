# Build stage
FROM golang:1.21-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o gaiol ./cmd/web-server/

# Runtime stage
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app

COPY --from=builder /app/gaiol .
COPY --from=builder /app/web ./web

EXPOSE 8080
ENV PORT=8080

USER nobody
CMD ["./gaiol"]
