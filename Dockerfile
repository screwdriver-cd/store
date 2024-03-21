FROM node:18

# Screwdriver Store Version
ARG VERSION=latest

# Create our application directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install Screwdriver API
RUN npm install screwdriver-store@$VERSION
WORKDIR /usr/src/app/node_modules/screwdriver-store

# Setup configuration folder
RUN ln -s /usr/src/app/node_modules/screwdriver-store/config /config

# Expose the web service port
EXPOSE 80

# Add Tini
ENV TINI_VERSION v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini
ENTRYPOINT ["/tini", "--"]

# Run the service
CMD [ "node", "./bin/server" ]
