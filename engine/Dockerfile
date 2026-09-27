FROM maven:3.9.11-eclipse-temurin-21@sha256:6fdc855a6ed81d288ca7ca37ac6ff5e9308b612485c0801d70b25a858c83d237 AS build
WORKDIR /build
COPY pom.xml ./
COPY src ./src
RUN mvn -B -ntp verify

FROM eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555
RUN addgroup -g 10001 engine && adduser -D -u 10001 -G engine engine
WORKDIR /app
COPY --from=build /build/target/engine-1.1.0.jar ./engine.jar
COPY --from=build /build/target/lib ./lib
COPY --from=build /build/target/bom.json ./sbom.json
USER 10001:10001
ENTRYPOINT ["java", "-Xmx128m", "-XX:+ExitOnOutOfMemoryError", "-cp", "/app/engine.jar:/app/lib/*", "org.openehr.modelling.engine.Server"]
