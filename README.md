# 📸 Batch Photo Editor

A modern and ultra-fast desktop application for batch image processing. Built to apply watermarks, logos, and effects to hundreds of photos simultaneously, leveraging the performance and parallel processing capabilities of the Rust language.

## ✨ Key Features

* ⚡ **Extreme Speed:** Parallel processing across all CPU cores (powered by Rust & `rayon`).
* 🧱 **Tiled Watermark:** Advanced "checkerboard" pattern option to automatically cover images with the selected logo.
* 🎛️ **Live Preview:** Interactive canvas allowing visual adjustment of logo size, position, and opacity before exporting.
* 🔄 **Flexible Export:** Native support for **JPG, PNG, and WEBP** formats, with dynamic quality adjustment (10-100%).
* 🏷️ **Smart Renaming:** Automatic addition of custom prefixes to exported files.
* 📊 **Real-Time Monitoring:** Integrated progress bar communicating directly between the Rust backend and the React frontend.

## 🛠️ Technologies Used

* **Frontend:** React, TypeScript, Vite, Fabric.js (for the visual canvas engine).
* **Backend:** Rust, Tauri (for fast and secure native OS integration).
* **Image Processing:** The `image` crate (Rust).
* **CI/CD:** GitHub Actions for automated compilation and releases of every new version.

## 🚀 How to Use

There is no need to download the source code or development environments to use the app! 
1. Go to the **[Releases](../../releases)** section on the right side of this GitHub page.
2. Download the latest installer (the `.exe` file).
3. Open the app, select your images, and enjoy fast editing.

## 💻 For Developers (Running from source)

If you want to modify or explore the code, follow these steps:

### Prerequisites
* [Node.js](https://nodejs.org/) (for the frontend)
* [Rust](https://www.rust-lang.org/) (for the backend)
* [Tauri (Windows)](https://v2.tauri.app/start/prerequisites/) development components

### Setup Steps
1.Clone this repository:
   ```bash
   git clone https://github.com/Kannji01/Batch-Photo-Editor.git
   ```
2.Navigate to the project folder:
  ```bash
  cd Batch-Photo-Editor
  ```
3.Install dependencies:
  ```bash
  npm install
  ```
4.Run the app in development mode:
  ```bash
  npm run tauri dev
  ```
## 👨‍💻 Author
Developed by **[Kannji01](https://github.com/Kannji01)** as a standalone cross-platform application.
