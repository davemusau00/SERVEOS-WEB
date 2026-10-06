FROM alpine:3.22
RUN apk add --no-cache age ca-certificates jq postgresql17-client rclone
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod 0555 /usr/local/bin/backup.sh && addgroup -S backup && adduser -S -G backup backup
USER backup
ENTRYPOINT ["/usr/local/bin/backup.sh"]
