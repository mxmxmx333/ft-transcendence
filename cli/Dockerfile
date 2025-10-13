FROM rust:1.90-slim-trixie AS builder

RUN apt-get update && apt-get upgrade -y && apt-get install -y pkg-config libssl-dev

ENV RUSTFLAGS="-A dead_code"

WORKDIR /usr/src/cli
COPY . .
RUN cargo install --path .

FROM debian:trixie-slim
COPY --from=builder /usr/local/cargo/bin/cli /usr/local/bin/cli

RUN apt-get update && apt-get upgrade -y

CMD ["cli"]
