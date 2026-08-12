# E-Commerce

A simple multi-tenant e-commerce application built with React and FastAPI.

## Tech Stack

- React
- TypeScript
- FastAPI
- MongoDB
- Vite

## Run Backend

Open a terminal:

```bash
cd E-comm
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload

## Backend runs at: http://127.0.0.1:8000

## Run Frontend

Open another terminal: 
- cd E-comm\client
- npm install
- npm run dev

## Frontend runs at: http://localhost:5173
