from app.core.config import settings
from app.core.security import create_access_token, decode_access_token


def test_tokens_bound_to_tenant_even_if_key_is_accidentally_reused(monkeypatch):
    monkeypatch.setattr(settings,"TENANT_ID","alpha")
    alpha=create_access_token({"sub":"same@example.com"})
    assert decode_access_token(alpha)["iss"]=="convenecore:alpha"
    monkeypatch.setattr(settings,"TENANT_ID","bravo")
    assert decode_access_token(alpha) is None
    bravo=create_access_token({"sub":"same@example.com"})
    assert decode_access_token(bravo)["iss"]=="convenecore:bravo"
    monkeypatch.setattr(settings,"TENANT_ID","")
    assert decode_access_token(bravo) is None
