"""
Domain Event Type Definitions

This module defines all domain event types used in the event sourcing system.
Events represent business facts that have occurred in the system.

Key principles:
- Events are immutable - they cannot be modified or deleted
- Events are domain-specific - they describe business facts, not technical operations
- Events carry all data needed to understand what happened
"""

from enum import Enum
from typing import Dict, List, Optional
from dataclasses import dataclass


class EventType(str, Enum):
    """
    Domain event types for the farm management system.
    
    Naming convention: {entity}_{action_past_tense}
    """
    
    # ==========================================================================
    # REGISTRATION EVENTS (Animal lifecycle)
    # ==========================================================================
    
    # Birth/Creation
    BIRTH_REGISTERED = "birth_registered"
    
    # Death
    DEATH_RECORDED = "death_recorded"
    
    # Weight changes
    WEIGHT_RECORDED = "weight_recorded"
    WEANING_WEIGHT_RECORDED = "weaning_weight_recorded"
    
    # Parentage
    MOTHER_ASSIGNED = "mother_assigned"
    FATHER_ASSIGNED = "father_assigned"
    
    # Status changes (non-death)
    STATUS_CHANGED = "status_changed"
    
    # Attribute corrections
    GENDER_CORRECTED = "gender_corrected"
    COLOR_RECORDED = "color_recorded"
    ANIMAL_NUMBER_CORRECTED = "animal_number_corrected"
    BIRTH_DATE_CORRECTED = "birth_date_corrected"
    
    # Notes
    NOTES_UPDATED = "notes_updated"
    MOTHER_NOTES_UPDATED = "mother_notes_updated"
    
    # Registration prefixes
    RP_ANIMAL_UPDATED = "rp_animal_updated"
    RP_MOTHER_UPDATED = "rp_mother_updated"
    
    # Mother weight
    MOTHER_WEIGHT_RECORDED = "mother_weight_recorded"
    
    # Scrotal circumference (for bulls)
    SCROTAL_CIRCUMFERENCE_RECORDED = "scrotal_circumference_recorded"
    
    # ==========================================================================
    # INSEMINATION EVENTS
    # ==========================================================================
    
    INSEMINATION_RECORDED = "insemination_recorded"
    INSEMINATION_CANCELLED = "insemination_cancelled"  # Replaces DELETE
    INSEMINATION_DATE_CORRECTED = "insemination_date_corrected"
    BULL_ASSIGNED = "bull_assigned"
    INSEMINATION_NOTES_UPDATED = "insemination_notes_updated"
    
    # ==========================================================================
    # ANIMAL DELETION (compensating event, not actual delete)
    # ==========================================================================
    
    ANIMAL_DELETED = "animal_deleted"


# Event type groupings for validation and filtering
REGISTRATION_EVENTS: List[EventType] = [
    EventType.BIRTH_REGISTERED,
    EventType.DEATH_RECORDED,
    EventType.WEIGHT_RECORDED,
    EventType.WEANING_WEIGHT_RECORDED,
    EventType.MOTHER_ASSIGNED,
    EventType.FATHER_ASSIGNED,
    EventType.STATUS_CHANGED,
    EventType.GENDER_CORRECTED,
    EventType.COLOR_RECORDED,
    EventType.ANIMAL_NUMBER_CORRECTED,
    EventType.BIRTH_DATE_CORRECTED,
    EventType.NOTES_UPDATED,
    EventType.MOTHER_NOTES_UPDATED,
    EventType.RP_ANIMAL_UPDATED,
    EventType.RP_MOTHER_UPDATED,
    EventType.MOTHER_WEIGHT_RECORDED,
    EventType.SCROTAL_CIRCUMFERENCE_RECORDED,
    EventType.ANIMAL_DELETED,
]

INSEMINATION_EVENTS: List[EventType] = [
    EventType.INSEMINATION_RECORDED,
    EventType.INSEMINATION_CANCELLED,
    EventType.INSEMINATION_DATE_CORRECTED,
    EventType.BULL_ASSIGNED,
    EventType.INSEMINATION_NOTES_UPDATED,
]

ALL_EVENT_TYPES: List[EventType] = REGISTRATION_EVENTS + INSEMINATION_EVENTS


# =============================================================================
# MIGRATION MAPPINGS (from old events_state to new domain_events)
# =============================================================================

OLD_TO_NEW_EVENT_MAP: Dict[str, EventType] = {
    'born': EventType.BIRTH_REGISTERED,
    'death': EventType.DEATH_RECORDED,
    'inseminacion': EventType.INSEMINATION_RECORDED,
    'eliminacion_inseminacion': EventType.INSEMINATION_CANCELLED,
    # 'correccion' requires field-level inspection - see CORRECTION_FIELD_MAP
}

CORRECTION_FIELD_MAP: Dict[str, EventType] = {
    'weight': EventType.WEIGHT_RECORDED,
    'weaning_weight': EventType.WEANING_WEIGHT_RECORDED,
    'mother_id': EventType.MOTHER_ASSIGNED,
    'father_id': EventType.FATHER_ASSIGNED,
    'status': EventType.STATUS_CHANGED,
    'gender': EventType.GENDER_CORRECTED,
    'color': EventType.COLOR_RECORDED,
    'animal_number': EventType.ANIMAL_NUMBER_CORRECTED,
    'born_date': EventType.BIRTH_DATE_CORRECTED,
    'notes': EventType.NOTES_UPDATED,
    'notes_mother': EventType.MOTHER_NOTES_UPDATED,
    'rp_animal': EventType.RP_ANIMAL_UPDATED,
    'rp_mother': EventType.RP_MOTHER_UPDATED,
    'mother_weight': EventType.MOTHER_WEIGHT_RECORDED,
    'scrotal_circumference': EventType.SCROTAL_CIRCUMFERENCE_RECORDED,
    # Insemination corrections
    'insemination_date': EventType.INSEMINATION_DATE_CORRECTED,
    'bull_id': EventType.BULL_ASSIGNED,
    'insemination_notes': EventType.INSEMINATION_NOTES_UPDATED,
}


@dataclass
class EventPayload:
    """
    Base structure for event payloads.
    
    All events should include:
    - The data that changed
    - Previous value (for corrections)
    - New value
    - Any relevant context
    """
    pass


@dataclass
class BirthRegisteredPayload(EventPayload):
    """Payload for birth_registered event"""
    animal_number: str
    born_date: Optional[str] = None
    weight: Optional[float] = None
    gender: Optional[str] = None
    status: Optional[str] = None
    color: Optional[str] = None
    mother_id: Optional[str] = None
    father_id: Optional[str] = None
    notes: Optional[str] = None
    notes_mother: Optional[str] = None
    rp_animal: Optional[str] = None
    rp_mother: Optional[str] = None
    mother_weight: Optional[float] = None
    weaning_weight: Optional[float] = None
    scrotal_circumference: Optional[float] = None
    insemination_round_id: Optional[str] = None
    insemination_identifier: Optional[str] = None


@dataclass
class DeathRecordedPayload(EventPayload):
    """Payload for death_recorded event"""
    death_date: str
    previous_status: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class WeightRecordedPayload(EventPayload):
    """Payload for weight changes"""
    weight: float
    previous_weight: Optional[float] = None


@dataclass
class InseminationRecordedPayload(EventPayload):
    """Payload for insemination_recorded event"""
    insemination_id: int
    insemination_identifier: str
    insemination_round_id: str
    mother_id: str
    mother_visual_id: Optional[str] = None
    bull_id: Optional[str] = None
    insemination_date: str = None
    animal_type: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class InseminationCancelledPayload(EventPayload):
    """Payload for insemination_cancelled event (replaces DELETE)"""
    insemination_id: int
    insemination_date: str
    reason: Optional[str] = None
    previous_bull_id: Optional[str] = None


@dataclass
class FieldCorrectionPayload(EventPayload):
    """Generic payload for field corrections"""
    field_name: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None

