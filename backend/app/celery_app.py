from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("registre", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.timezone = "UTC"
celery_app.conf.task_default_queue = "registre"

# §8.2 : balayage nocturne des échéances/seuils/lots. Un déclenchement manuel
# (`POST .../alerts/run-scan`) et l'appel direct de la même fonction restent
# possibles indépendamment de Celery — voir app/tasks/alerts.py — ce fichier
# ne fait qu'ajouter le déclenchement automatique une fois Redis provisionné.
# Démarrage : `celery -A app.celery_app worker -l info` (traite les tâches)
# et `celery -A app.celery_app beat -l info` (les programme) comme deux
# process séparés, tous deux nécessitant REDIS_URL joignable.
celery_app.conf.beat_schedule = {
    "nightly-alert-scan": {
        "task": "app.tasks.alerts.run_nightly_alert_scan",
        "schedule": crontab(hour=2, minute=0),
    },
}

celery_app.autodiscover_tasks(["app.tasks"])
