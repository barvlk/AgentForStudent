import matplotlib.pyplot as plt
import matplotlib.patches as patches


def generate_matplotlib_architecture():
    fig, ax = plt.subplots(figsize=(14, 8))
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 10)
    ax.axis('off')

    # دالة مساعدة لرسم المربعات بتصميم فخم
    def draw_box(x, y, w, h, text, facecolor='#f8f9fa', edgecolor='#343a40'):
        box = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.3",
                                     facecolor=facecolor, edgecolor=edgecolor, linewidth=1.5)
        ax.add_patch(box)
        ax.text(x + w / 2, y + h / 2, text, ha='center', va='center', fontsize=10, fontweight='bold', color='#212529')

    # رسم مكونات المخطط المعماري
    draw_box(0.5, 6.5, 3.0, 1.5, "Student Request\n(Subjects, Exams, Tasks\nID: 446006609)", facecolor='#e9ecef')
    draw_box(0.5, 4.0, 3.0, 1.2, "Setup & Environment\n(.env keys, tasks.xlsx)", facecolor='#e9ecef')

    draw_box(4.2, 5.2, 2.8, 1.5, "Run Variation\n(Gemini API +\nRetry Wrapper 429)", facecolor='#d1e7dd')

    # إطار عمل الأجنت
    ax.add_patch(patches.FancyBboxPatch((7.5, 3.2), 3.8, 4.5, boxstyle="round,pad=0.4",
                                        facecolor='#cfe2ff', edgecolor='#084298', linewidth=1.5, linestyle='--'))
    ax.text(9.4, 7.4, "AgentForStudent Workflow Core", ha='center', fontsize=11, fontweight='bold', color='#084298')

    draw_box(7.8, 6.0, 3.2, 0.9, "Profile (BKT State)")
    draw_box(7.8, 4.8, 3.2, 0.9, "Generate (RAG & LLM)")
    draw_box(7.8, 3.6, 3.2, 0.9, "Optimize (SJF / Priority)")

    draw_box(7.8, 1.8, 3.2, 1.0, "Support Tools\n(RAG Search, Priority Scheduler)", facecolor='#fff3cd')

    draw_box(11.8, 4.5, 1.8, 2.0, "Structured\nResults\n(Plan & Report)", facecolor='#f8d7da')

    # رسم الأسهم التوضيحية
    ax.annotate("", xy=(4.2, 6.0), xytext=(3.5, 7.0), arrowprops=dict(arrowstyle="->", lw=1.5, color='#495057'))
    ax.annotate("", xy=(4.2, 5.5), xytext=(3.5, 4.5),
                arrowprops=dict(arrowstyle="->", lw=1.5, color='#495057', linestyle="dashed"))
    ax.annotate("", xy=(7.5, 5.7), xytext=(7.0, 5.7), arrowprops=dict(arrowstyle="->", lw=1.5, color='#495057'))
    ax.annotate("", xy=(11.8, 5.5), xytext=(11.3, 5.5), arrowprops=dict(arrowstyle="->", lw=1.5, color='#495057'))
    ax.annotate("", xy=(9.4, 4.8), xytext=(9.4, 2.8),
                arrowprops=dict(arrowstyle="->", lw=1.5, color='#495057', linestyle="dashed"))

    plt.title("AgentForStudent - System Architecture Diagram", fontsize=14, fontweight='bold', pad=20)

    output_filename = "architecture_diagram.png"
    plt.savefig(output_filename, dpi=300, bbox_inches='tight')
    print(f"✅ تم توليد المخطط المعماري وحفظه بنجاح باسم: {output_filename}")


if __name__ == '__main__':
    generate_matplotlib_architecture()