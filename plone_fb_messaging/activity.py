
from Products.Five import BrowserView
from zope.component import getMultiAdapter

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

        print "XXX called", message, description, event_type, url, uid
