"""Devise et fuseau horaire proposés par défaut selon le pays déclaré à l'inscription
(cahier des charges §4.4, §12.2). L'organisation peut changer sa devise ensuite depuis
ses réglages ; l'éditeur peut ajouter des devises depuis son espace (§13).
"""

# code pays ISO 3166-1 alpha-2 -> (devise ISO 4217, fuseau horaire IANA)
_COUNTRY_DEFAULTS: dict[str, tuple[str, str]] = {
    "CM": ("XAF", "Africa/Douala"),
    "SN": ("XOF", "Africa/Dakar"),
    "CI": ("XOF", "Africa/Abidjan"),
    "TG": ("XOF", "Africa/Lome"),
    "BJ": ("XOF", "Africa/Porto-Novo"),
    "BF": ("XOF", "Africa/Ouagadougou"),
    "ML": ("XOF", "Africa/Bamako"),
    "NE": ("XOF", "Africa/Niamey"),
    "GW": ("XOF", "Africa/Bissau"),
    "GA": ("XAF", "Africa/Libreville"),
    "TD": ("XAF", "Africa/Ndjamena"),
    "CG": ("XAF", "Africa/Brazzaville"),
    "CF": ("XAF", "Africa/Bangui"),
    "GQ": ("XAF", "Africa/Malabo"),
    "CD": ("CDF", "Africa/Kinshasa"),
    "MA": ("MAD", "Africa/Casablanca"),
    "DZ": ("DZD", "Africa/Algiers"),
    "TN": ("TND", "Africa/Tunis"),
    "FR": ("EUR", "Europe/Paris"),
    "BE": ("EUR", "Europe/Brussels"),
    "US": ("USD", "America/New_York"),
    "GB": ("GBP", "Europe/London"),
}

_DEFAULT = ("USD", "UTC")


def currency_and_timezone_for_country(country_code: str) -> tuple[str, str]:
    return _COUNTRY_DEFAULTS.get(country_code.upper(), _DEFAULT)
