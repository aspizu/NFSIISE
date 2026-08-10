// SPDX-License-Identifier: MIT

#include "../Wrapper.h"

#ifndef NFS_NO_NETWORK
#error "The WebAssembly socket shim requires NFS_NO_NETWORK"
#endif

/*
 * The browser build has no direct TCP or UDP access. Returning a WSA startup
 * error keeps all network modes disabled while satisfying the translated
 * game's imported symbol table.
 */

#define WSASYSNOTREADY 10091

REALIGN STDCALL int32_t inet_addr_wrap(int32_t cp)
{
	(void)cp;
	return -1;
}

REALIGN STDCALL int32_t listen_wrap(int32_t fd, int32_t n)
{
	(void)fd;
	(void)n;
	return -1;
}

REALIGN STDCALL int32_t inet_ntoa_wrap(int32_t in)
{
	(void)in;
	return 0;
}

REALIGN STDCALL int32_t gethostbyname_wrap(int32_t name)
{
	(void)name;
	return 0;
}

REALIGN STDCALL int32_t gethostname_wrap(int32_t name, int32_t namelen)
{
	(void)name;
	(void)namelen;
	return -1;
}

REALIGN STDCALL int32_t connect_wrap(int32_t sock, int32_t name, int32_t namelen)
{
	(void)sock;
	(void)name;
	(void)namelen;
	return -1;
}

REALIGN STDCALL int32_t accept_wrap(int32_t sock, int32_t addr, int32_t addrlen)
{
	(void)sock;
	(void)addr;
	(void)addrlen;
	return -1;
}

REALIGN STDCALL int32_t WSAFDIsSet_wrap(int32_t fd, int32_t w_fds)
{
	(void)fd;
	(void)w_fds;
	return 0;
}

REALIGN STDCALL int32_t select_wrap(int32_t nfds, int32_t readfds, int32_t writefds, int32_t exceptfds, int32_t timeout)
{
	(void)nfds;
	(void)readfds;
	(void)writefds;
	(void)exceptfds;
	(void)timeout;
	return -1;
}

REALIGN STDCALL int32_t send_wrap(int32_t sock, int32_t buf, int32_t len, int32_t flags)
{
	(void)sock;
	(void)buf;
	(void)len;
	(void)flags;
	return -1;
}

REALIGN STDCALL int32_t recv_wrap(int32_t sock, int32_t buf, int32_t len, int32_t flags)
{
	(void)sock;
	(void)buf;
	(void)len;
	(void)flags;
	return -1;
}

REALIGN STDCALL int32_t getsockname_wrap(int32_t sock, int32_t name, int32_t namelen)
{
	(void)sock;
	(void)name;
	(void)namelen;
	return -1;
}

REALIGN STDCALL int32_t bind_wrap(int32_t sock, int32_t name, int32_t namelen)
{
	(void)sock;
	(void)name;
	(void)namelen;
	return -1;
}

REALIGN STDCALL int32_t htons_wrap(int32_t hostshort)
{
	return ((hostshort & 0xFF) << 8) | ((hostshort >> 8) & 0xFF);
}

REALIGN STDCALL int32_t ioctlsocket_wrap(int32_t sock, int32_t cmd, int32_t argp)
{
	(void)sock;
	(void)cmd;
	(void)argp;
	return -1;
}

REALIGN STDCALL int32_t setsockopt_wrap(int32_t sock, int32_t level, int32_t optname, int32_t optval, int32_t optlen)
{
	(void)sock;
	(void)level;
	(void)optname;
	(void)optval;
	(void)optlen;
	return -1;
}

REALIGN STDCALL int32_t WSAGetLastError_wrap(void)
{
	return WSASYSNOTREADY;
}

REALIGN STDCALL int32_t closesocket_wrap(int32_t sock)
{
	(void)sock;
	return -1;
}

REALIGN STDCALL int32_t socket_wrap(int32_t af, int32_t type, int32_t protocol)
{
	(void)af;
	(void)type;
	(void)protocol;
	return -1;
}

REALIGN STDCALL int32_t WSACleanup_wrap(void)
{
	return 0;
}

REALIGN STDCALL int32_t WSAStartup_wrap(int32_t wVersionRequested, int32_t WSAData)
{
	(void)wVersionRequested;
	(void)WSAData;
	return WSASYSNOTREADY;
}

REALIGN STDCALL int32_t sendto_wrap(int32_t sock, int32_t buf, int32_t len, int32_t flags, int32_t to, int32_t tolen)
{
	(void)sock;
	(void)buf;
	(void)len;
	(void)flags;
	(void)to;
	(void)tolen;
	return -1;
}

REALIGN STDCALL int32_t recvfrom_wrap(int32_t sock, int32_t buf, int32_t len, int32_t flags, int32_t from, int32_t fromlen)
{
	(void)sock;
	(void)buf;
	(void)len;
	(void)flags;
	(void)from;
	(void)fromlen;
	return -1;
}
