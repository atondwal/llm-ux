"""In-memory storage for development. Will be replaced with database."""
from typing import Dict, List
from ..models import Conversation
from ..branching_models import Leaf, MessageVersion


class Storage:
    """In-memory storage manager."""
    
    def __init__(self):
        # Core data
        self.conversations: Dict[str, Conversation] = {}
        
        # Branching/versioning
        self.leaves: Dict[str, List[Leaf]] = {}  # conversation_id -> list of leaves
        self.active_leaves: Dict[str, str] = {}  # conversation_id -> active leaf_id
        self.message_versions: Dict[str, List[MessageVersion]] = {}  # message_id -> list of versions
        self.leaf_messages: Dict[str, List[str]] = {}  # leaf_id -> list of message_ids created in this leaf
        
        # Yjs documents
        self.yjs_documents: Dict[str, List] = {}  # document_id -> list of websockets
    
    def clear_all(self):
        """Clear all storage (useful for tests)."""
        self.conversations.clear()
        self.leaves.clear()
        self.active_leaves.clear()
        self.message_versions.clear()
        self.leaf_messages.clear()
        self.yjs_documents.clear()


# Global storage instance
storage = Storage()