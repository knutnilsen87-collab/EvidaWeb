FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q -DskipTests dependency:go-offline
COPY src src
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       curl tesseract-ocr tesseract-ocr-eng tesseract-ocr-nor \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home evida
WORKDIR /app
COPY --from=build /workspace/target/evida-api-0.1.0.jar /app/evida-api.jar
RUN mkdir -p /data/quarantine && chown -R evida:evida /app /data
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/evida-api.jar", "--spring.profiles.active=prod"]
