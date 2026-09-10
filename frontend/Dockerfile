FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# TURN is optional. When configured, these values are compiled into the browser bundle
# so WebRTC can relay audio for devices/networks that cannot connect directly with STUN.
ARG NEXT_PUBLIC_TURN_URLS=""
ARG NEXT_PUBLIC_TURN_USERNAME=""
ARG NEXT_PUBLIC_TURN_CREDENTIAL=""
ENV NEXT_PUBLIC_TURN_URLS=$NEXT_PUBLIC_TURN_URLS
ENV NEXT_PUBLIC_TURN_USERNAME=$NEXT_PUBLIC_TURN_USERNAME
ENV NEXT_PUBLIC_TURN_CREDENTIAL=$NEXT_PUBLIC_TURN_CREDENTIAL

# Build production Next.js bundle
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/next.config.ts ./next.config.ts
COPY --from=base /app/public ./public

EXPOSE 3000

CMD ["npm", "start"]
