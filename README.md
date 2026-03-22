# Open Anamnesis Example Project

This is an example demo project showcasing the **open-anamnesis** CLI tool.

This project build a static website which can be viewed here: https://erenmirza.github.io/open-anamnesis-example/

## Prerequisites

- Python 3.7 or higher
- pip (Python package installer)

## Installation

1. **Create a virtual environment:**
   ```bash
   python -m venv .venv
   ```

2. **Activate the virtual environment:**
   ```bash
   source .venv/Scripts/activate  # On Windows
   # source .venv/bin/activate    # On macOS/Linux
   ```

3. **Install open-anamnesis:**
   ```bash
   pip install open-anamnesis
   ```

4. **Verify installation:**
   ```bash
   anamnesis --version
   ```

## Usage

1. **Initialize a new anamnesis project:**
   ```bash
   anamnesis init
   ```

2. **Navigate to the project directory:**
   ```bash
   cd anamnesis_project
   ```

3. **Compile the project:**
   ```bash
   anamnesis compile
   ```

4. **Build and run the project:**
   ```bash
   anamnesis build
   ```

5. **Access the application:**

   Open your browser and visit: [http://127.0.0.1:5000](http://127.0.0.1:5000)

## Project Structure

- `anamnesis_project/` - Main project directory containing decks and configuration