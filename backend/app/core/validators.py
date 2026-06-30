"""Common validation functions for the application."""
import ipaddress
import socket
from urllib.parse import urlparse

from app.core.exceptions import BadRequestError


def validate_password_strength(password: str) -> None:
    """
    Validate password strength requirements.

    Raises:
        BadRequestError: If password doesn't meet requirements
    """
    if len(password) < 8:
        raise BadRequestError("密码长度不能少于8个字符")
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not (has_letter and has_digit):
        raise BadRequestError("密码必须包含至少一个字母和一个数字")


def validate_base_url(url: str) -> None:
    """Validate that base_url is not targeting internal/private networks."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise BadRequestError("URL 必须使用 http 或 https 协议")
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if not hostname:
        raise BadRequestError("URL 缺少有效主机名")
    # Block localhost and common internal addresses
    blocked = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"}
    if hostname in blocked:
        raise BadRequestError("不允许访问内部网络地址")
    addresses: set[str] = set()
    try:
        addresses.add(str(ipaddress.ip_address(hostname)))
    except ValueError:
        try:
            for info in socket.getaddrinfo(hostname, parsed.port or 443, type=socket.SOCK_STREAM):
                addresses.add(info[4][0])
        except socket.gaierror:
            # Connection handling will report an unreachable provider. If it resolves
            # later, this validation runs again immediately before model use.
            return

    for address in addresses:
        ip = ipaddress.ip_address(address)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise BadRequestError("不允许访问内部或私有网络地址")
