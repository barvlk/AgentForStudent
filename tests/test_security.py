import pytest

from agentforstudent.security import crypto
from agentforstudent.security.auth import (
    AuthService,
    LoginStatus,
    PasswordPolicyError,
    hash_password,
    validate_password,
    verify_password,
)
from agentforstudent.security.masking import mask_student_id, redact_text

SID = 441126225


# ---------- التشفير ----------
def test_encrypt_roundtrip():
    key = crypto.generate_key()
    data = "درجات سرية".encode()
    token = crypto.encrypt_bytes(data, key)
    assert token != data and "درجات".encode() not in token
    assert crypto.decrypt_bytes(token, key) == data


def test_wrong_key_rejected():
    token = crypto.encrypt_bytes(b"secret", crypto.generate_key())
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt_bytes(token, crypto.generate_key())


def test_tampered_file_rejected():
    key = crypto.generate_key()
    token = bytearray(crypto.encrypt_bytes(b"secret data", key))
    token[-5] ^= 0x01  # تعديل بايت واحد
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt_bytes(bytes(token), key)


def test_encrypt_file(tmp_path):
    key = crypto.generate_key()
    src, enc = tmp_path / "a.xlsx", tmp_path / "a.xlsx.enc"
    src.write_bytes(b"excel-bytes")
    crypto.encrypt_file(src, enc, key)
    assert crypto.read_encrypted(enc, key) == b"excel-bytes"


# ---------- كلمات المرور ----------
def test_password_hash_is_salted_and_verifiable():
    h1, h2 = hash_password("Passw0rd!"), hash_password("Passw0rd!")
    assert h1 != h2  # salt مختلف كل مرة
    assert verify_password("Passw0rd!", h1)
    assert not verify_password("wrong", h1)


@pytest.mark.parametrize("pw", ["short1", "allletters", "12345678"])
def test_password_policy_rejects_weak(pw):
    with pytest.raises(PasswordPolicyError):
        validate_password(pw)


def test_login_flow_and_lockout(db):
    auth = AuthService(db, max_attempts=3, lockout_minutes=15)
    auth.set_password(SID, "Start123", must_change=True)

    res = auth.authenticate(SID, "Start123")
    assert res.ok and res.must_change_password

    assert auth.authenticate(SID, "bad").status is LoginStatus.INVALID
    assert auth.authenticate(SID, "bad").status is LoginStatus.INVALID
    assert auth.authenticate(SID, "bad").status is LoginStatus.LOCKED
    # حتى كلمة المرور الصحيحة مرفوضة أثناء القفل
    assert auth.authenticate(SID, "Start123").status is LoginStatus.LOCKED

    auth.unlock(SID)
    assert auth.authenticate(SID, "Start123").ok


def test_unknown_user_gets_same_error(db):
    auth = AuthService(db)
    assert auth.authenticate(999999999, "whatever1").status is LoginStatus.INVALID


def test_change_password(db):
    auth = AuthService(db)
    auth.set_password(SID, "Start123", must_change=True)
    assert not auth.change_password(SID, "wrong", "NewPass99")
    assert auth.change_password(SID, "Start123", "NewPass99")
    res = auth.authenticate(SID, "NewPass99")
    assert res.ok and not res.must_change_password


def test_provision_does_not_overwrite(db):
    auth = AuthService(db)
    first = auth.provision([1, 2])
    assert set(first) == {1, 2}
    assert auth.provision([1, 2, 3]) .keys() == {3}


def test_audit_log_masks_ids(db):
    auth = AuthService(db)
    auth.authenticate(SID, "x")
    entry = auth.recent_audit(1)[0]
    assert entry["event"] == "login_failed"
    assert str(SID) not in entry["subject"]


# ---------- إخفاء البيانات ----------
def test_masking():
    assert mask_student_id(SID) == "44*****25"
    text = redact_text(f"student {SID} key AIzaSyA1234567890abcdefghijklmnop")
    assert str(SID) not in text and "AIza" not in text
