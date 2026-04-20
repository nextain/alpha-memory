# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and pnpm-lock.yaml for dependency installation
COPY package.json ./
COPY pnpm-lock.yaml ./

# Install dependencies using pnpm
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the TypeScript project
RUN npm run build

# Expose the port the app runs on
EXPOSE 3001

# Run the application
CMD ["npm", "start"]