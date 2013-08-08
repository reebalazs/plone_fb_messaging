
import time
from firebase import Firebase

from Products.Five import BrowserView
from zope.component import getMultiAdapter

from .auth import get_auth_info


def add_activity(d):
    """Add an activity to the stream.
    """
    info = get_auth_info(None, None, admin=True)
    url = '%s/activities/' % (info['config']['firebase_url'], )
    activities = Firebase(url, auth_token=info['auth_token'])
    response = activities.push(d)
    if not isinstance(response, dict):
        # Not on python2.6.
        response = response()
    print "Actitity added, FB Response", response


class SimulateActivity(BrowserView):

    def __call__(self):
        form = self.request.form
        message = form['message']
        description = form.get('description', '')
        event_type = form['eventType']
        cstate = getMultiAdapter((self.context, self.request),
                name='plone_context_state')
        url = cstate.view_url()
        uid = self.context.UID()
        ts = int(time.time() * 1000)

        print "simulate activity", message, description, event_type, url, uid
        add_activity(dict(
            message=message,
            description=description,
            eventType=event_type,
            url=url,
            uid=uid,
            ts=ts,
            ))