# Use Debian instead of Alpine to avoid SWC/Monaco native lib issues
FROM node:20-bullseye

# Set working directory
WORKDIR /app

# Copy only dependency files first to leverage Docker cache properly
COPY package.json package-lock.json ./

# Clean install dependencies (ensures all dependencies are present)
RUN npm ci

# Copy the rest of the application
COPY . .

# Expose the Next.js dev port
EXPOSE 3000

# Run Next.js in development mode
CMD ["npm", "run", "dev"]
