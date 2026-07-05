FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /api .

FROM alpine:3.24
WORKDIR /app
COPY --from=build /api .
ENV PORT=8080
EXPOSE 8080
CMD ["./api"]