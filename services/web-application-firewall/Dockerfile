ARG NGINX_VERSION

FROM nginx:${NGINX_VERSION} as build

ARG MODSEC_VERSION \
    LMDB_VERSION
# Note: libpcre++-dev (PCRE3) is required by the build description,
# even though the build will use PCRE2.
RUN set -eux; \
    echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections; \
    apt-get update -qq; \
    LD_LIBRARY_PATH="" apt-get install -y -qq --no-install-recommends --no-install-suggests \
        automake \
        cmake \
        doxygen \
        g++ \
        git \
        libcurl4-gnutls-dev \
        libfuzzy-dev \
        libgeoip-dev \
        liblua5.3-dev \
        libpcre++-dev \
        libpcre2-dev \
        libtool \
        libxml2-dev \
        libyajl-dev \
        make \
        patch \
        pkg-config \
        ruby \
        zlib1g-dev; \
     apt-get clean; \
     rm -rf /var/lib/apt/lists/*

WORKDIR /sources

RUN set -eux; \
    git clone https://github.com/LMDB/lmdb --branch LMDB_${LMDB_VERSION} --depth 1; \
    make -C lmdb/libraries/liblmdb install; \
    strip /usr/local/lib/liblmdb*.so*

RUN set -eux; \
    git clone https://github.com/SpiderLabs/ModSecurity --branch v"${MODSEC_VERSION}" --depth 1 --recursive; \
    cd ModSecurity; \
    ARCH=$(gcc -print-multiarch); \
    sed -ie "s/i386-linux-gnu/${ARCH}/g" build/ssdeep.m4; \
    sed -ie "s/i386-linux-gnu/${ARCH}/g" build/pcre2.m4; \
    ./build.sh; \
    ./configure --with-yajl --with-ssdeep --with-geoip --with-pcre2 --enable-silent-rules; \
    make install; \
    strip /usr/local/modsecurity/lib/lib*.so*

RUN set -eux; \
    git clone -b master --depth 1 https://github.com/SpiderLabs/ModSecurity-nginx.git; \
    curl -sSL https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz -o nginx-${NGINX_VERSION}.tar.gz; \
    tar -xzf nginx-${NGINX_VERSION}.tar.gz; \
    cd ./nginx-${NGINX_VERSION}; \
    ./configure --with-compat --add-dynamic-module=../ModSecurity-nginx; \
    make modules; \
    strip objs/ngx_http_modsecurity_module.so; \
    cp objs/ngx_http_modsecurity_module.so /etc/nginx/modules/;

FROM nginx:${NGINX_VERSION}

ARG MODSEC_VERSION \
    LMDB_VERSION \
    MODSEC_RULE_ENGINE \
    LOG_LEVEL

ENV \
    MODSEC_RULE_ENGINE=${MODSEC_RULE_ENGINE:-On} \
    LOG_LEVEL=${LOG_LEVEL:-info} \
    LD_LIBRARY_PATH=/usr/local/modsecurity/lib:/usr/local/lib:/lib:/usr/lib

RUN set -eux; \
    apt-get update -qq; \
    LD_LIBRARY_PATH="" apt-get install -y -qq --no-install-recommends --no-install-suggests \
      ca-certificates \
      libcurl4 \
      libcurl4-gnutls-dev \
      libfuzzy2 \
      liblua5.3 \
      libxml2 \
      libyajl2; \
    rm -rf /var/lib/apt/lists/*; \
    apt-get clean; \
    mkdir -p /tmp/modsecurity/data /tmp/modsecurity/upload /tmp/modsecurity/tmp /usr/local/modsecurity; \
    chown -R nginx:nginx /tmp/modsecurity

COPY --from=build /usr/local/modsecurity/lib/libmodsecurity.so.${MODSEC_VERSION} /usr/local/modsecurity/lib/
COPY --from=build /etc/nginx/modules/ngx_http_modsecurity_module.so /etc/nginx/modules/ngx_http_modsecurity_module.so
COPY --from=build /usr/local/lib/liblmdb.so* /usr/local/lib/

RUN set -eux; \
    ln -s /usr/local/modsecurity/lib/libmodsecurity.so.${MODSEC_VERSION} /usr/local/modsecurity/lib/libmodsecurity.so.3.0; \
    ln -s /usr/local/modsecurity/lib/libmodsecurity.so.${MODSEC_VERSION} /usr/local/modsecurity/lib/libmodsecurity.so.3; \
    ln -s /usr/local/modsecurity/lib/libmodsecurity.so.${MODSEC_VERSION} /usr/local/modsecurity/lib/libmodsecurity.so;
