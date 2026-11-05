import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupShuffleSplit


# --- القسم الأول: تحميل وتطهير البيانات أو توليدها ---
def generate_or_load_data(file_path):
    print("[1] Initializing dataset...")
    try:
        df_grades = pd.read_excel(file_path, sheet_name=0)
        print("Dataset loaded from file successfully.")

        rename_mapping = {
            'الرقم الجامعي': 'student_id',
            'المستوى الدراسي الحالي': 'current_level',
            'ترم المادة': 'term_no',
            'رمز المقرر': 'course_code',
            'الساعات': 'credits',
            'الدرجة': 'score',
            'التقدير': 'letter',
            'النقاط': 'points',
            'المعدل_التراكمي': 'term_gpa'
        }
        df_grades = df_grades.rename(columns=rename_mapping)

    except Exception as e:
        print(f"Could not load file ({e}), generating simulated student dataset automatically...")
        np.random.seed(42)
        n_students = 300
        courses = [
            ('CS1011', 'Programming', 3), ('IND1101', 'General', 2),
            ('MTH1141', 'Math', 3), ('MTH1441', 'Math', 3),
            ('AI2001', 'AI', 3), ('CS2015', 'Programming', 4),
            ('AI3201', 'AI', 3), ('SEC1101', 'Systems', 3)
        ]

        data = []
        for s_id in range(446000001, 446000001 + n_students):
            level = np.random.choice([1, 2, 3, 4, 5, 6, 7, 8])
            cgpa = round(np.random.uniform(2.0, 4.0), 2)
            for i, (code, domain, cred) in enumerate(courses[:level * 2]):
                score = int(np.clip(np.random.normal(80, 10), 50, 100))
                term = (i // 2) + 1
                data.append({
                    'student_id': s_id,
                    'current_level': f"المستوى {level}",
                    'term_no': term,
                    'course_code': code,
                    'credits': cred,
                    'score': score,
                    'letter': 'A' if score >= 90 else ('B' if score >= 80 else 'C'),
                    'points': 4.0 if score >= 90 else 3.0,
                    'term_gpa': cgpa,
                    'domain': domain,
                    'passed': 1 if score >= 60 else 0
                })
        df_grades = pd.DataFrame(data)
        return df_grades

    # تحويل وإجبار الأرقام لتكون من نوع صحيح (Integer) حصرياً
    if 'term_no' in df_grades.columns:
        df_grades['term_no'] = pd.to_numeric(df_grades['term_no'].astype(str).str.extract(r'(\d+)')[0],
                                             errors='coerce').fillna(1).astype(int)
    else:
        df_grades['term_no'] = 1

    if 'credits' in df_grades.columns:
        df_grades['credits'] = pd.to_numeric(df_grades['credits'], errors='coerce').fillna(3).astype(int)

    if 'score' in df_grades.columns:
        df_grades['score'] = pd.to_numeric(df_grades['score'], errors='coerce').fillna(75).astype(float)
        df_grades['passed'] = df_grades['score'].apply(lambda x: 1 if x >= 60 else 0)

    def assign_domain(code):
        code_str = str(code)
        if code_str.startswith('MTH'):
            return 'Math'
        elif code_str.startswith('CS') or code_str.startswith('CEN'):
            return 'Programming'
        elif code_str.startswith('AI'):
            return 'AI'
        elif code_str.startswith('SEC') or code_str.startswith('DS'):
            return 'Systems'
        else:
            return 'General'

    if 'course_code' in df_grades.columns:
        df_grades['domain'] = df_grades['course_code'].apply(assign_domain)

    return df_grades


# --- القسم الثاني: نموذج تتبع المهارات BKT ---
class SimpleBKT:
    def __init__(self):
        self.params = {
            'AI': {'L0': 0.60, 'T': 0.02, 'G': 0.20, 'S': 0.15},
            'Math': {'L0': 0.30, 'T': 0.15, 'G': 0.20, 'S': 0.20},
            'Programming': {'L0': 0.70, 'T': 0.02, 'G': 0.20, 'S': 0.20},
            'Systems': {'L0': 0.50, 'T': 0.02, 'G': 0.30, 'S': 0.20}
        }

    def simulate_student_domain_mastery(self, student_df, domain):
        p_l = self.params.get(domain, self.params['Math'])['L0']
        p_t = self.params.get(domain, self.params['Math'])['T']
        p_g = self.params.get(domain, self.params['Math'])['G']
        p_s = self.params.get(domain, self.params['Math'])['S']

        domain_rows = student_df[student_df['domain'] == domain].sort_values('term_no')
        for _, row in domain_rows.iterrows():
            obs = 1 if row['score'] >= 80 else 0
            if obs == 1:
                p_correct = p_l * (1 - p_s) + (1 - p_l) * p_g
                p_l = (p_l * (1 - p_s)) / p_correct if p_correct > 0 else p_l
            else:
                p_incorrect = p_l * p_s + (1 - p_l) * (1 - p_g)
                p_l = (p_l * p_s) / p_incorrect if p_incorrect > 0 else p_l
            p_l = p_l + (1 - p_l) * p_t
        return p_l


# --- القسم الثالث: تنبؤ المخاطر (Random Forest) ---
def build_features_and_train_models(dataset):
    print("[2] Engineering features and training risk models...")
    feature_rows = []
    for student_id, group in dataset.groupby('student_id'):
        group = group.sort_values('term_no')
        history = []
        for _, row in group.iterrows():
            # ضمان أن المقارنة تتم بين أرقام صحيحة
            term_val = int(row['term_no'])
            if term_val > 1 and len(history) > 0:
                hist_df = pd.DataFrame(history)
                prev_cgpa = (hist_df['score'] * hist_df['credits']).sum() / hist_df['credits'].sum() if hist_df[
                                                                                                            'credits'].sum() > 0 else 0
                feature_rows.append({
                    'student_id': student_id,
                    'course': row['course_code'],
                    'term': term_val,
                    'prev_cgpa': prev_cgpa,
                    'domain_prior_avg': hist_df[hist_df['domain'] == row['domain']]['score'].mean() if not hist_df[
                        hist_df['domain'] == row['domain']].empty else 75.0,
                    'at_risk': 1 if row['score'] < 75 else 0
                })
            history.append(row)

    feat_df = pd.DataFrame(feature_rows)
    feat_df.fillna(75.0, inplace=True)

    if len(feat_df) > 10:
        X = feat_df[['prev_cgpa', 'domain_prior_avg']]
        y = feat_df['at_risk']
        groups = feat_df['student_id']
        gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
        train_idx, test_idx = next(gss.split(X, y, groups))
        rf_model = RandomForestClassifier(class_weight='balanced', random_state=42)
        rf_model.fit(X.iloc[train_idx], y.iloc[train_idx])
        print("Random Forest Model Trained Successfully!")
        return rf_model
    return None


# --- القسم الرابع: حلقة وكيل ReAct المتكاملة ---
class ReActAgent:
    def __init__(self, dataset):
        self.df = dataset
        self.bkt = SimpleBKT()

    def run_cycle(self, student_id):
        print(f"\n[ReAct Agent Loop Started for Student: {student_id}]")
        print("Thought: New week started. Check the student's academic state first.")
        print(f"Action: get_transcript(student_id={student_id})")
        student_data = self.df[self.df['student_id'] == student_id]
        if student_data.empty:
            print("Observation: Student ID not found.")
            return

        cgpa = (student_data['score'] * student_data['credits']).sum() / student_data['credits'].sum()
        print(f"Observation: CGPA {cgpa:.2f}, total courses taken: {len(student_data)}")

        print("Action: bkt_mastery()")
        mastery_dict = {domain: self.bkt.simulate_student_domain_mastery(student_data, domain) for domain in
                        ['AI', 'Math', 'Programming', 'Systems']}
        print(f"Observation: Mastery levels -> { {k: round(v, 2) for k, v in mastery_dict.items()} }")
        print("Final: Send weekly plan and personalized review recommendations to student.")


if __name__ == "__main__":
    df_main = generate_or_load_data("students_by_term_150.xlsx")
    build_features_and_train_models(df_main)

    sample_id = df_main['student_id'].iloc[0]
    agent = ReActAgent(df_main)
    agent.run_cycle(sample_id)