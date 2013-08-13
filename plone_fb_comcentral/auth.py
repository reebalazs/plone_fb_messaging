
# Copyright (c) 2013 Enfold Systems, Inc. All rights reserved.

from firebase_token_generator import create_token
from zope.component import getMultiAdapter
from Products.Five import BrowserView

from .config import (
    get_config,
    get_properties,
    get_env_config,
)


def get_user_data(context, request):
    """Return a {'plone_userid':..., 'fullname': ...} dictionary
    plone_userid is None (if anon),

    or (XXX currently disabled) False,
    if the user is not allowed to use this feature.
    """
    portal_state = getMultiAdapter((context, request), name="plone_portal_state")
    member = portal_state.member()
    plone_userid = member.getId()
    fullname = member.getProperty('fullname')
    return dict(
        plone_userid=plone_userid,
        fullname=fullname,
    )

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

def get_allowed_userid(context, request):
    return get_user_data(context, request)['plone_userid']


def get_auth_info(context, request, admin=False):
    if not admin:
        user_data = get_user_data(context, request)
    else:
        user_data = dict(
            plone_userid='admin',
            fullname='',
        )

    custom_data = {
        'ploneUserid': user_data['plone_userid'],
        'ploneFullName': user_data['fullname'],
    }
    options = {
        'admin': admin,
    }
    config = get_config()

    if user_data['plone_userid'] is not None and user_data['plone_userid'] is not False:
        token = create_token(config['firebase_secret'], custom_data, options)
    else:
        # If the user is not allowed, (plone_userid is None) return a void token.
        # If the user is anonymous (not logged in), (plone_userid is False) we do not
        # allow it either. Return a void token.
        token = ''

    # Some info that is not auth related
    portal_state = getMultiAdapter((context, request), name="plone_portal_state")
    portal_url = portal_state.portal_url()
    static = {
        'staticRoot':  portal_url + '/++resource++fb_comcentral/',
        'portraitRoot':  portal_url + '/portal_memberdata/portraits/',
    }

    return dict(
        auth_token=token,
        auth_data=custom_data,
        config=config,
        static=static,
    )


def get_auth_token(context, request, admin=False):
    get_auth_info(context, request, admin=False)['auth_token']


class AllowedUseridView(BrowserView):

    def __call__(self):
        return get_allowed_userid(self.context, self.request)
