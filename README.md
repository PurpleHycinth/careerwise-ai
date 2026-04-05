
# CareerWise-AI Backend  

The **CareerWise-AI Backend** is a high-performance API built with **FastAPI** that provides intelligent resume analysis and scoring based on semantic similarity with job descriptions.  

---

## ✨ Features  
- **Semantic Resume Analysis** – Uses a Sentence Transformer model (`all-MiniLM-L6-v2`) to understand the context of resumes and job descriptions, going beyond simple keyword matching.  
- **Two-Step API Workflow** – Includes separate endpoints for file uploads (`/upload`) and analysis (`/analyze`).  
- **Temporary File Handling** – Securely handles uploaded resumes, storing them temporarily and deleting them after 10 minutes.  
- **Scalable Architecture** – Built using the Application Factory pattern for maintainability and scalability.  
- **Environment-based Configuration** – Uses `.env` files to manage settings like CORS origins.  

---

## 🛠 Tech Stack  
- **Framework:** FastAPI  
- **Server:** Uvicorn  
- **Machine Learning:** PyTorch, Sentence-Transformers  
- **File Handling:** PyPDF2, python-docx  
- **Configuration:** python-dotenv  

---

## 🚀 Getting Started  

### Prerequisites  
- Python **3.8+**  
- NVIDIA GPU with CUDA installed (for GPU acceleration)  
- Access to a terminal or command prompt  

---

### 1️⃣ Clone the Repository  
```bash
git clone https://github.com/your-username/careerwise-ai.git
cd careerwise-ai/backend
````

### 2️⃣ Create and Activate Virtual Environment

It’s recommended to use a virtual environment. This project uses a venv that inherits system site packages for GPU-enabled PyTorch.

```bash
# Create the venv
python -m venv venv --system-site-packages

# Activate the venv (Windows PowerShell)
.\venv\Scripts\Activate.ps1
```

### 3️⃣ Install Dependencies

```bash
pip install -r requirements.txt
```

### 4️⃣ Set Up Environment Variables

Create a `.env` file in the `backend` directory. Use the example below (or copy from `.env.example`):

```env
# Comma-separated list of allowed origins for CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### 5️⃣ Run the Server

```bash
uvicorn server:app --reload
```

The API will be available at: **[http://127.0.0.1:8000](http://127.0.0.1:8000)**
Interactive API docs: **[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)**

---

## 📖 API Endpoints

### 1. Upload Resumes

**Endpoint:** `POST /upload/`
**Description:** Upload one or more resumes (`.pdf`, `.docx`). Files are stored temporarily.

**Body:** form-data

```
key: resumes (File)
```

**Response (200 OK):**

```json
{
  "file_ids": [
    "c8a1b2d3-e4f5-6789-0123-abcdef012345.pdf"
  ]
}
```

---

### 2. Analyze Resumes

**Endpoint:** `POST /analyze/`
**Description:** Takes a job description and uploaded file IDs, returning a ranked list of resumes by similarity score.

**Body (JSON):**

```json
{
  "job_description": "A detailed job description...",
  "file_ids": [
    "c8a1b2d3-e4f5-6789-0123-abcdef012345.pdf"
  ]
}
```

**Response (200 OK):**

```json
{
  "ranked_resumes": [
    {
      "filename": "c8a1b2d3-e4f5-6789-0123-abcdef012345.pdf",
      "score": 88.42
    }
  ]
}
```

---

## 🖥️ Frontend

Frontend setup and integration instructions will be added soon.

---


