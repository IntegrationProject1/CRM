# Stage 1: Build the application with Java 20 and Maven
FROM eclipse-temurin:20-jdk AS build
# Install Maven
RUN apt-get update && apt-get install -y maven
# Set the working directory
WORKDIR /app
# Copy the pom.xml and download dependencies
COPY pom.xml .
RUN mvn dependency:go-offline
# Copy the source code and build the application
COPY src ./src
RUN mvn clean package -DskipTests
# Verify the existence of target/dependency (for debugging)
RUN ls -la target/dependency || echo "Directory target/dependency not found!"

# Stage 2: Run the application with Java 20 JRE
FROM eclipse-temurin:20-jre
WORKDIR /app
# Copy the built JAR
COPY --from=build /app/target/crm-microservice-1.0-SNAPSHOT.jar ./crm-app.jar
# Copy the dependencies
COPY --from=build /app/target/dependency ./lib
# Copy the .env file
COPY .env /app/.env
# Start the application with dependencies on the classpath
CMD ["java", "-cp", "crm-app.jar:lib/*", "com.expo.crm.Main"]