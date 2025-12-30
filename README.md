# RoboSpectra - AI-Powered Image Annotation Platform

## Purpose
RoboSpectra is an intelligent image annotation platform designed for creating high-quality labeled datasets for computer vision and machine learning projects. The platform combines manual annotation tools with AI-assisted features (SAM model integration) to streamline the data labeling process. It supports multiple annotation types including bounding boxes, polygons, and brush-based segmentation, making it ideal for object detection, instance segmentation, and document annotation tasks.

## Getting Started

### Prerequisites
- **Node.js** (v16 or higher) and npm
- **Python** (v3.9 or higher)
- **PostgreSQL** database

### Installation & Setup

1. **Clone or extract the project**
   ```bash
   cd robospectra
   ```

2. **Install Frontend Dependencies**
   ```bash
   npm install
   ```

3. **Install Backend Dependencies**
   ```bash
   cd back_end
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**
   - Create a `.env` file in the `back_end` directory
   - Add your database credentials and configuration:
     ```
     DATABASE_URL=postgresql://username:password@localhost/roboflow
     SECRET_KEY=your-secret-key-here
     CORS_ORIGINS=http://localhost:5173,http://localhost:3000
     ```

5. **Start the Application**
   
   **Backend Server** (in `back_end` directory):
   ```bash
   uvicorn main:app --reload
   ```
   
   **Frontend Development Server** (in root directory):
   ```bash
   npm run dev
   ```

6. **Access the Application**
   - Open your browser and navigate to `http://localhost:5173`
   - You will see the RoboSpectra landing page

## How to Use

### Step 1: Register or Login

1. **First-Time Users - Register**
   - Click the **"Register"** link at the bottom of the login page
   - Fill in your details: Name, Email, Username, and Password
   - Click **"REGISTER"** button
   - You will be automatically logged in and redirected to the home page

2. **Existing Users - Login**
   - Enter your **Email** and **Password**
   - Click **"LOGIN"** button
   - You will be redirected to the home page

3. **Forgot Password?**
   - Click **"Forgot Password?"** link on the login page
   - Enter your email and click **"Send OTP"**
   - Check your email for the 5-digit OTP code
   - Enter the OTP, set your new password, and click **"Reset Password"**

### Understanding the Navigation Bar

After logging in, you will see the main navigation bar at the top with three menu items:

1. **Home** 
   - Takes you to the landing page
   - Shows platform features and overview
   - Your starting point after login

2. **Annotation** 
   - Opens the annotation workspace (Resources page)
   - This is where you create projects, upload images, and annotate
   - Access your own projects or assigned projects from here

3. **Dashboard** 
   - **Owner-only access** - Only users with owner privileges can access this page
   - Manage bulk uploads, assign files to users, and track progress
   - Regular users will see an "Access Denied" message if they try to access this page

### Step 2: Choose Your Workflow

After logging in, you have **two main options** depending on your role:

---

## Option A: Create Your Own Project (Any User)

This workflow is for users who want to create and manage their own annotation projects.

### 1. Navigate to Annotation Workspace
- From the home page, click on **"Resources"** in the top navigation bar
- This opens the annotation workspace

### 2. Create a New Project
- Click the **"New Project"** button
- Fill in the project details:
  - **Project Name**: Give your project a meaningful name
  - **Project Type**: Select "Object Detection" or "Segmentation"
  - **Description**: Optional description of your project
  - **Classes**: Enter class names separated by commas (e.g., "car, person, dog")
- Click **"Create Project"**

### 3. Upload Images
- Click the **"Upload Images"** button
- Select images from your computer (supports JPG, PNG, JPEG, PDF)
- PDFs will be automatically converted to images
- Wait for the upload to complete

### 4. Start Annotating
- Select an image from the image list
- Choose your annotation tool from the toolbar:
  - **Select Tool (V)**: Select and move existing annotations
  - **Bounding Box (B)**: Click and drag to draw rectangular boxes
  - **Polygon (P)**: Click to add points, double-click to complete the shape
  - **Brush (R)**: Paint segmentation masks with adjustable brush size
- Select a class from the class dropdown before drawing
- Your annotations are automatically saved

### 5. Navigate Between Images
- Use **Arrow Keys** (← →) or click on images in the sidebar
- All annotations are saved automatically as you work

### 6. Export Your Dataset
- Click the **"Export"** button
- Choose your export format (YOLO, COCO JSON, Pascal VOC)
- Download the ZIP file containing your annotated dataset

---

## Option B: Work on Assigned Projects (Regular Users)

This workflow is for users who have been assigned files by a project owner.

### 1. Check Assigned Files
- From the home page, click on **"Resources"** in the top navigation bar
- In the annotation workspace, click **"Assigned Projects"** button
- You will see a list of all files assigned to you

### 2. Select an Assigned File
- Click on any file from your assigned list
- The file will open in the annotation workspace
- You will see the project name and classes already defined by the owner

### 3. Annotate the File
- Use the annotation tools (Bounding Box, Polygon, Brush) to label objects
- Select the appropriate class for each annotation
- Your work is automatically saved

### 4. Complete and Submit
- Once you finish annotating, your work is automatically marked as "Completed"
- The project owner can track your progress from the Dashboard

---

## Option C: Manage Projects and Users (Owner Only)

This workflow is only available to users with **Owner** privileges.

### 1. Access the Dashboard
- Click on **"Dashboard"** in the top navigation bar
- Only users with owner status can access this page

### 2. Bulk Upload Documents
- Click **"Bulk Upload"** button
- Select multiple files (images or PDFs) to upload
- Files will be added to the document pool

### 3. Create Project and Assign Files
- In the Dashboard, select files from the document list (checkbox)
- Click the **"Users"** dropdown and select a user to assign
- Enter a **Project Name** in the modal
- Click **"Confirm Assignment"**
- The system will:
  - Create a new project with the specified name
  - Assign the selected files to the chosen user
  - Notify the user (files appear in their "Assigned Projects")

### 4. Monitor Progress
- View statistics: Assigned, Unassigned, Pending, Overdue, Completed
- Track which users have completed their assigned files
- Export completed annotations per user

### 5. User Management
- Click **"Users Details"** to see all registered users
- View each user's file counts (Total, Completed, Pending)
- Add or remove owner status for users
- Export completed files for specific users

---

## Key Features

- 🎨 **Multiple Annotation Tools** - Bounding box, polygon, and brush-based segmentation
- 🤖 **AI-Assisted Annotation** - SAM (Segment Anything Model) integration for faster labeling
- 📄 **Document Support** - Annotate PDFs and images with specialized document annotation tools
- 👥 **Team Collaboration** - Assign tasks and manage team members (Owner feature)
- 📊 **Export Formats** - YOLO, COCO JSON, Pascal VOC, and CSV formats
- ⌨️ **Keyboard Shortcuts** - Efficient workflow with hotkeys (V-Select, B-Box, P-Polygon, R-Brush)
- 💾 **Auto-save** - Never lose your work with automatic annotation saving
- 🔐 **User Roles** - Owner and Regular User roles with different permissions
- 📈 **Progress Tracking** - Dashboard for owners to monitor annotation progress

## Tech Stack

- **Frontend**: React, Vite, Bootstrap, React Router
- **Backend**: FastAPI, Python
- **Database**: PostgreSQL
- **AI Models**: Ultralytics SAM, YOLO
- **Image Processing**: OpenCV, Pillow, PyMuPDF
- **Authentication**: JWT tokens, bcrypt password hashing

---

**RoboSpectra** - Empowering AI development with intelligent annotation tools.
