FROM node:20-alpine AS source

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Generate the public blank template files from the same presets used by the builder.
RUN node scripts/export-template-manifest.cjs > /tmp/minuteseal-formats.json

FROM python:3.12-slim AS template-documents
WORKDIR /work
RUN pip install --no-cache-dir reportlab==4.4.6 python-docx==1.2.0 pypdfium2==4.30.0 pillow==11.3.0
COPY --from=source /tmp/minuteseal-formats.json ./formats.json
COPY scripts/build-template-assets.py ./build-template-assets.py
RUN python build-template-assets.py formats.json /generated

FROM source AS base
COPY --from=template-documents /generated ./public/template-files

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
