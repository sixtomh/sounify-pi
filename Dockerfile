FROM php:8.2-cli-bookworm

# Instalar dependencias del sistema requeridas en Orange Pi (ARM64 / aarch64)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    git \
    libsqlite3-dev \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Instalar yt-dlp de forma global
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Instalar extensiones PHP necesarias
RUN docker-php-ext-install pdo pdo_sqlite

# Configurar directorio de trabajo
WORKDIR /app

# Copiar archivos del proyecto
COPY . /app

# Crear directorios para almacenamiento y descargas
RUN mkdir -p /app/storage/downloads && chmod -R 777 /app/storage

# Exponer el puerto del servidor web
EXPOSE 8080

# Habilitar workers concurrentes en el servidor integrado de PHP
ENV PHP_CLI_SERVER_WORKERS=4

# Comando de inicio usando el servidor embebido optimizado de PHP
CMD ["php", "-S", "0.0.0.0:8080", "-t", "/app/public"]
