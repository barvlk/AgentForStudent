"""آلة حاسبة آمنة للوكيل (Safe Calculator).

استخدام ``eval()`` على نص قادم من نموذج لغوي أو من المستخدم خطر جداً
(يمكن تنفيذ أي كود بايثون، مثل حذف ملفات). هنا نحلل التعبير إلى شجرة AST
ونسمح فقط بالأرقام والعمليات الحسابية، ونرفض أي شيء آخر.
"""

from __future__ import annotations

import ast
import operator

_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_MAX_EXPONENT = 100
_MAX_LENGTH = 200


class UnsafeExpressionError(ValueError):
    pass


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > _MAX_EXPONENT:
            raise UnsafeExpressionError("الأس كبير جداً.")
        return _BIN_OPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_eval(node.operand))
    raise UnsafeExpressionError("التعبير يحتوي على عناصر غير مسموحة.")


def safe_calculate(expression: str) -> float:
    expression = expression.replace("×", "*").replace("÷", "/").strip()
    if len(expression) > _MAX_LENGTH:
        raise UnsafeExpressionError("التعبير طويل جداً.")
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise UnsafeExpressionError("صيغة التعبير غير صحيحة.") from exc
    try:
        return _eval(tree)
    except ZeroDivisionError as exc:
        raise UnsafeExpressionError("قسمة على صفر.") from exc
    except OverflowError as exc:
        raise UnsafeExpressionError("الناتج كبير جداً.") from exc
