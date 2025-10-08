from typing import Optional
from fastapi import HTTPException

_firebase_ready = False
_auth = None

def _init_firebase_if_needed():
    global _firebase_ready, _auth
    if _firebase_ready:
        return
    try:
        import firebase_admin
        from firebase_admin import auth as fb_auth, credentials
        import os
        import json
        
        if not firebase_admin._apps:
            # Try FIREBASE_CREDENTIALS first (for production)
            firebase_creds_json = os.getenv('FIREBASE_CREDENTIALS')
            if firebase_creds_json:
                # Parse JSON from environment variable
                cred_dict = json.loads(firebase_creds_json)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
            else:
                # Fallback to file path (for local development)
                service_account_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
                if service_account_path and os.path.exists(service_account_path):
                    cred = credentials.Certificate(service_account_path)
                    firebase_admin.initialize_app(cred)
                else:
                    # Last resort: default credentials
                    firebase_admin.initialize_app()
        
        _auth = fb_auth
        _firebase_ready = True
    except Exception as e:
        print(f"Firebase initialization error: {e}")
        _firebase_ready = False
        _auth = None

def verify_bearer_id_token(authorization_header: Optional[str]) -> Optional[dict]:
    """Verify Firebase ID token from Authorization: Bearer <token>.
    Returns decoded token dict on success, or None if not present or not verifiable.
    Raises HTTPException on explicit invalid token.
    """
    if not authorization_header:
        return None
    parts = authorization_header.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    token = parts[1]
    _init_firebase_if_needed()
    if not _auth:
        # Firebase not configured; treat as missing
        return None
    try:
        decoded = _auth.verify_id_token(token)
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid ID token")


