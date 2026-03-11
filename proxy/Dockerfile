# Build stage — context is the repo root (outreach-generator/)
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY proxy/go.mod .
RUN go mod download
COPY proxy/ .
RUN go build -o proxy api.go

# Run stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/proxy .
EXPOSE 8080
CMD ["./proxy"]
