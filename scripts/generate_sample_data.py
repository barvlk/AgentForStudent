"""توليد بيانات تجريبية فقط:  python scripts/generate_sample_data.py --students 200"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agentforstudent.data.sample_data import main  # noqa: E402

if __name__ == "__main__":
    main()
