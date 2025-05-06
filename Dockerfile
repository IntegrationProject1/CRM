FROM node:18

# 1️⃣ Zet de werkmap in de container
WORKDIR /app

# 2️⃣ Kopieer enkel package-definities, installeer dependencies
COPY package*.json ./
RUN npm install

# 3️⃣ Kopieer de rest van je code (index.js, consumers/, salesforceClient.js, .env…)
COPY . .

# 4️⃣ Start je service: index.js zit nu direct in /app
CMD ["node", "index.js"]
