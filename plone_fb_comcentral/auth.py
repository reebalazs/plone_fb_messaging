
# Copyright (c) 2013 Enfold Systems, Inc. All rights reserved.

from firebase_token_generator import create_token
from zope.component import getMultiAdapter
from Products.Five import BrowserView

from .config import (
    get_config,
    get_properties,
    get_env_config,
)


def get_allowed_userid(context, request):
    """Return the userid, None (if anon),

    or (XXX currently disabled) False,
    if the user is not allowed to use this feature.
    """
    portal_state = getMultiAdapter((context, request), name="plone_portal_state")
    plone_userid = portal_state.member().getId()

    return plone_userid

    # XXX XXX filter_users is currently not used.
    #
    ## If the user is not allowed, refuse to give a token.
    #props = get_properties()
    #
    #if props is not None and \
    #        props.getProperty('filter_users', False) and \
    #        plone_userid not in props.getProperty('allowed_users', ()):
    #    # User is not allowed.
    #    return False
    #else:
    #    return plone_userid


def get_auth_info(context, request, admin=False):
    if not admin:
        plone_userid = get_allowed_userid(context, request)
    else:
        plone_userid = 'admin'

    custom_data = {
        'ploneUserid': plone_userid,
    }
    options = {
        'admin': admin,
    }
    config = get_config()

    if plone_userid is not None and plone_userid is not False:
        token = create_token(config['firebase_secret'], custom_data, options)
    else:
        # If the user is not allowed, (plone_userid is None) return a void token.
        # If the user is anonymous (not logged in), (plone_userid is False) we do not
        # allow it either. Return a void token.
        token = ''

    return dict(
        auth_token=token,
        auth_data=custom_data,
        config=config,
    )


def get_auth_token(context, request, admin=False):
    get_auth_info(context, request, admin=False)['auth_token']


class AllowedUseridView(BrowserView):

    def __call__(self):
        return get_allowed_userid(self.context, self.request)
