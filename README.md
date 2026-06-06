# MotionFrame

MotionFrame is a full-stack web application featuring a React frontend (built with Vite) and a FastAPI Python backend.

## Prerequisites

- **Node.js** (v18 or higher recommended)
- **Python** (v3.10 or higher recommended)
- **Git**

---

## 🚀 Getting Started

Follow these instructions to set up the project locally on your machine.

### 1. Clone the Repository

```bash
git clone https://github.com/Charanbtech/MotionFrame.git
cd MotionFrame
```

### 2. Frontend Setup

The frontend is built using React and Vite. The configuration files are located in the root of the project.

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Create a `.env` file in the root directory (`MotionFrame/.env`) and add the following variables:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
   VITE_API_BASE_URL=http://localhost:8000
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`.

### 3. Backend Setup

The backend is built with Python and FastAPI. All related files are in the `back_end` directory.

1. **Navigate to the backend directory:**
   ```bash
   cd back_end
   ```

2. **Create and activate a virtual environment:**
   - **Windows:**
     ```bash
     python -m venv venv
     .\venv\Scripts\activate
     ```
   - **Mac/Linux:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables:**
   Create a `.env` file in the `back_end` directory (`MotionFrame/back_end/.env`) and add the following variables:
   ```env
   MAIL_USERNAME=your_email@gmail.com
   MAIL_PASSWORD=your_app_password
   MAIL_FROM=your_email@gmail.com
   MAIL_SERVER=smtp.gmail.com
   MAIL_PORT=587
   MAIL_FROM_NAME=MotionFrame
   FRONTEND_URL=http://localhost:5173
   GOOGLE_CLIENT_ID=your_google_client_id_here
   ```

5. **Run the FastAPI server:**
   ```bash
   uvicorn main:app --reload
   ```
   The backend API will be available at `http://localhost:8000`. You can access the automatic interactive API documentation at `http://localhost:8000/docs`.

---

## 🛠️ Tech Stack

- **Frontend:** React.js, Vite, Bootstrap, Chart.js
- **Backend:** FastAPI, Python, SQLite (or configured database), YOLO/SAM (for AI tasks)
- **Authentication:** Google OAuth
