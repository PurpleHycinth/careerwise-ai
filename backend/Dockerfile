FROM python:3.11-slim

# System deps for PyMuPDF
RUN apt-get update && apt-get install -y \
    gcc \
    libfreetype6-dev \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download NLTK data at build time, not runtime
RUN python -m nltk.downloader punkt punkt_tab stopwords -d /usr/share/nltk_data

# Copy the full backend (includes fine-tuned models + app code)
COPY . .

# Uploads folder must exist
RUN mkdir -p uploads

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]