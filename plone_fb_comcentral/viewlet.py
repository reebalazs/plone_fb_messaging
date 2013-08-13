
from Products.CMFCore.utils import getToolByName
from plone.app.layout.viewlets import common as base

from .auth import get_auth_info


class FirebaseViewlet(base.ViewletBase):
    """
    """

    def update(self):
        super(FirebaseViewlet, self).update()
        auth_info = get_auth_info(self.context, self.request)
        self.auth_token = auth_info['auth_token']
        self.auth_data = auth_info['auth_data']
        self.config = auth_info['config']
        self.static = auth_info['static']
        #print "Firebase messaging AUTH_INFO", auth_info

        # Is the product installed?
        # We need to check it, as this information is not obvious based on
        # the configuration alone.
        # The importance of this check is to avoid the viewlet being
        # rendered before the product is installed with quickinstaller
        # in a newly created portal.
        qi = getToolByName(self.context, 'portal_quickinstaller')
        self.is_installed = qi.isProductInstalled('plone_fb_comcentral')

    def render(self):
        if self.is_installed and self.auth_token:
            return super(FirebaseViewlet, self).render()
        else:
            return ''
