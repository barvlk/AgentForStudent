# AgentForStudent 🎓🤖

An intelligent academic assistant framework powered by Agentic AI and student data analytics. It tracks mastery levels, predicts academic risks, and generates personalized study plans.

## 🛠️ Tech Stack
* Python
* Pandas & NumPy (Data manipulation and simulation)
* Scikit-Learn (RandomForestClassifier & GroupShuffleSplit)
* OpenPyXL (Excel integration)

## ⚙️ Core Modules

1. **Dataset Pipeline (`generate_or_load_data`):**
   * Handles external Excel spreadsheets and normalizes Arabic/English column headers.
   * Includes a robust fallback mechanism that automatically generates simulated academic data for 300 students if the file is missing.

2. **Skill Tracking (`SimpleBKT`):**
   * Implements Bayesian Knowledge Tracing (BKT) to dynamically model and track student mastery probabilities across different domains (AI, Math, Programming, Systems).

3. **Risk Prediction (`RandomForestClassifier`):**
   * Performs feature engineering based on historical cumulative GPAs and domain-specific prior averages to predict and flag at-risk students.

4. **Agent Coordination Loop (`ReActAgent`):**
   * Coordinates a ReAct (Thought-Action-Observation) reasoning cycle to check student transcripts, evaluate skill mastery, and output personalized weekly review plans.

## 🚀 Quick Start

1. Clone the repository:
   ```bash
   git clone [https://github.com/barvlk/AgentForStudent.git](https://github.com/barvlk/AgentForStudent.git)
   cd AgentForStudent