FROM node:22

# Screwdriver Store Version
ARG VERSION=latest

# Create our application directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install Screwdriver Store
RUN npm install screwdriver-store@$VERSION
WORKDIR /usr/src/app/node_modules/screwdriver-store

# Setup configuration folder
RUN ln -s /usr/src/app/node_modules/screwdriver-store/config /config

# Expose the web service port
EXPOSE 80

# Add dumb-init
RUN wget -O /usr/local/bin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_x86_64
RUN chmod +x /usr/local/bin/dumb-init
ENTRYPOINT ["/usr/local/bin/dumb-init", "--"]

# Run the service
CMD [ "node", "./bin/server" ]
