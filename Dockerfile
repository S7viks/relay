# Dashboard (Vite) build
FROM node:22-alpine AS dashboard
WORKDIR /dash
COPY dashboard/package.json dashboard/package-lock.json* ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Go build
FROM golang:1.21-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=dashboard /dash/dist ./dashboard/dist

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o gaiol ./cmd/web-server/

# Runtime stage
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app

COPY --from=builder /app/gaiol .
COPY --from=builder /app/dashboard/dist ./dashboard/dist

EXPOSE 8080
ENV PORT=8080

USER nobody
CMD ["./gaiol"]
