from agentforstudent.data.academic_records import AcademicRepository, normalize_records
from agentforstudent.data.sample_data import generate_students, generate_tasks
from agentforstudent.data.tasks_repository import TaskRepository


def test_sample_students_match_university_schema():
    raw = generate_students(20, seed=1)
    repo = AcademicRepository(normalize_records(raw))
    assert len(repo.student_ids()) == 20
    p = repo.profile(repo.student_ids()[0])
    assert 0 <= p.gpa <= 4


def test_sample_tasks_import_with_due_dates(db):
    students = generate_students(10, seed=1)
    tasks = generate_tasks(students, seed=1)
    repo = TaskRepository(db)
    assert repo.import_dataframe(tasks) == len(tasks)
    sid = int(tasks["الرقم الجامعي"].iloc[0])
    imported = repo.list(sid)
    assert imported and all(t.due_date is not None and t.est_hours for t in imported)
