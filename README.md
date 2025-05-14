# K8s Pretty Logger

A simple but powerful tool to visualize Kubernetes pod logs in real-time, with a clean and intuitive interface.

![K8s Pretty Logger Screenshot](https://via.placeholder.com/800x450?text=K8s+Pretty+Logger+Screenshot)

## 🚀 Quick Start

### Option 1: Using Quickstart Script (Recommended)

On macOS/Linux, you can use the provided quickstart script to set up everything automatically:

```bash
# Clone this repository
git clone https://github.com/pedroid999/k8s-pretty-logger.git
cd k8s-pretty-logger

# Make the script executable
chmod +x ./quickstart.sh

# Run the quickstart script
./quickstart.sh
```

The script will:
- Check if uv is installed
- Create and activate a virtual environment
- Install all dependencies
- Create a .env file from the template if it doesn't exist
- Start the web interface automatically

### Option 2: Using uv Directly

```bash
# Clone the repository
git clone https://github.com/pedroid999/k8s-pretty-logger.git
cd k8s-pretty-logger

# Install dependencies and run (Mac/Linux)
uv run app.py

# Install dependencies and run (Windows)
uv run app.py
```

### Option 3: Manual Setup with pip and venv

```bash
# Clone the repository
git clone https://github.com/pedroid999/k8s-pretty-logger.git
cd k8s-pretty-logger

# Mac/Linux
python -m venv .venv
source .venv/bin/activate
pip install -e .
python app.py

# Windows
python -m venv .venv
.venv\Scripts\activate
pip install -e .
python app.py
```

Then open your browser at http://localhost:5000 to access the application.

## 🧰 Prerequisites

- Python 3.11 or higher
- `kubectl` command-line tool configured with access to your GKE cluster
- A valid kubeconfig file with GKE cluster access

## 🛠️ Detailed Installation Guide

### For Mac Users

1. **Install Python 3.11+**
   
   Using Homebrew:
   ```bash
   brew install python@3.11
   ```
   
   Or download from [Python.org](https://www.python.org/downloads/)

2. **Install uv**

   ```bash
   pip install uv
   ```

3. **Clone the repository**
   
   ```bash
   git clone https://github.com/pedroid999/k8s-pretty-logger.git
   cd k8s-pretty-logger
   ```

4. **Run the application**
   
   ```bash
   uv run app.py
   ```

### For Windows Users

1. **Install Python 3.11+**
   
   Download and install from [Python.org](https://www.python.org/downloads/windows/)
   
   Ensure Python is added to your PATH during installation

2. **Install uv**

   ```bash
   pip install uv
   ```

3. **Clone the repository**
   
   ```bash
   git clone https://github.com/pedroid999/k8s-pretty-logger.git
   cd k8s-pretty-logger
   ```

4. **Run the application**
   
   ```bash
   uv run app.py
   ```

### For Linux Users

1. **Install Python 3.11+**
   
   Ubuntu/Debian:
   ```bash
   sudo apt update
   sudo apt install python3.11 python3.11-venv python3.11-dev
   ```
   
   Fedora:
   ```bash
   sudo dnf install python3.11
   ```
   
   Alternatively, use [pyenv](https://github.com/pyenv/pyenv) to manage Python versions

2. **Install uv**

   ```bash
   pip install uv
   ```

3. **Clone the repository**
   
   ```bash
   git clone https://github.com/pedroid999/k8s-pretty-logger.git
   cd k8s-pretty-logger
   ```

4. **Run the application**
   
   ```bash
   uv run app.py
   ```

## 📊 Features

- **Context Selection**: Switch between different Kubernetes contexts
- **Namespace and Pod Filtering**: Easily find the pods you need to inspect
- **Real-time Log Streaming**: Watch logs as they happen with auto-scroll
- **Log Filtering**: Filter logs to find specific information
- **Multi-container Support**: View logs from any container in a pod
- **UI Controls**: Pause/resume streaming, toggle auto-scroll, and clear logs
- **Status Indicators**: Visual indicators for pod and container status

## 🔧 Configuration

The application uses environment variables for configuration:

1. Copy the sample environment file:
   ```bash
   cp sample.env .env
   ```

2. Edit the `.env` file to customize settings:
   ```
   # Flask application configuration
   SECRET_KEY=your_secret_key
   FLASK_ENV=development
   PORT=5000
   
   # Debug mode (set to False in production)
   DEBUG=True
   
   # Optional: Kubernetes configuration path
   # KUBECONFIG=/path/to/your/kubeconfig
   ```

## 🔐 GKE Authentication

This application uses your local Kubernetes configuration for authentication to GKE clusters. Ensure you have:

1. **Installed Google Cloud SDK** - [Installation Guide](https://cloud.google.com/sdk/docs/install)

2. **Authenticated with GKE**:
   ```bash
   gcloud auth login
   gcloud container clusters get-credentials CLUSTER_NAME --zone ZONE --project PROJECT_ID
   ```

3. **Verified access**:
   ```bash
   kubectl get pods
   ```

If you're using a custom kubeconfig path, specify it in the `.env` file or as an environment variable:
```bash
export KUBECONFIG=/path/to/your/kubeconfig
```

## 🏗️ Project Structure

```
k8s-pretty-logger/
├── .venv/                  # Virtual environment (created automatically)
├── api/                    # Backend API
│   ├── __init__.py         # Package initialization
│   ├── kubernetes_client.py # K8s API interaction
│   └── templates/          # Jinja2 templates
│       └── index.html      # Main application template
├── static/                 # Static files
│   ├── css/                # CSS stylesheets
│   │   └── style.css       # Application styles
│   └── js/                 # JavaScript files
│       └── app.js          # Vue.js application
├── .env.sample             # Sample environment variables
├── app.py                  # Main application file
├── pyproject.toml          # Project metadata and dependencies
├── README.md               # This file
└── uv.lock                 # uv lockfile (created automatically)
```

## 🔍 Troubleshooting

### Common Issues

#### Application doesn't start
- Check that Python 3.11+ is installed: `python --version`
- Ensure all dependencies are installed: `uv pip list`
- Look for error messages in the terminal output

#### Cannot connect to Kubernetes API
- Verify that `kubectl` works from command line: `kubectl get pods`
- Check your kubeconfig file: `kubectl config view`
- Ensure you have the right context selected: `kubectl config current-context`

#### No logs appear
- Check if the selected pod is actually producing logs
- Ensure the pod is in the "Running" state
- Try selecting a different container if the pod has multiple

### Platform-Specific Issues

#### Mac
- If you get SSL verification errors, ensure your Python installation has proper SSL certificates
  ```bash
  pip install --upgrade certifi
  ```

#### Windows
- If you encounter issues with Socket.IO, try disabling antivirus temporarily or add an exception
- For path issues, ensure you're using the correct path separators (backslashes)

#### Linux
- If you get permission errors, ensure you have read access to your kubeconfig file
- For display issues, try a different browser or update your current one

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [Kubernetes Client Python](https://github.com/kubernetes-client/python)
- [Flask](https://flask.palletsprojects.com/)
- [Vue.js](https://vuejs.org/)
- [Socket.IO](https://socket.io/)
- [Bootstrap](https://getbootstrap.com/)
