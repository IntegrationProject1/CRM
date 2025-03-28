# Build Stage
# Build met Maven
FROM maven:3.8.6-openjdk-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

# Runtime
FROM openjdk:17-jdk-slim
WORKDIR /app
COPY --from=build /app/target/crm-app.jar ./crm-app.jar
CMD ["java", "-jar", "crm-app.jar"]