# This file is part of webmacs.
#
# webmacs is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# webmacs is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with webmacs.  If not, see <http://www.gnu.org/licenses/>.

import logging

from PyQt5.QtGui import (QOpenGLContext, QOpenGLVersionProfile,
                         QOffscreenSurface)
from PyQt5.QtWidgets import QApplication


def opengl_vendor():  # pragma: no cover
    """
    Get the OpenGL vendor used.

    This returns a string such as 'nouveau' or
    'Intel Open Source Technology Center'; or None if the vendor can't be
    determined.
    """
    # took from qutebrowser
    assert QApplication.instance()

    old_context = QOpenGLContext.currentContext()
    old_surface = None if old_context is None else old_context.surface()

    surface = QOffscreenSurface()
    surface.create()

    ctx = QOpenGLContext()
    if not ctx.create():
        logging.debug("opengl_vendor: Creating context failed!")
        return None

    if not ctx.makeCurrent(surface):
        logging.debug("opengl_vendor: Making context current failed!")
        return None

    try:
        if ctx.isOpenGLES():
            # Can't use versionFunctions there
            return None

        vp = QOpenGLVersionProfile()
        vp.setVersion(2, 0)

        vf = ctx.versionFunctions(vp)
        if vf is None:
            logging.debug("opengl_vendor: Getting version functions failed!")
            return None

        return vf.glGetString(vf.GL_VENDOR)
    finally:
        ctx.doneCurrent()
        if old_context and old_surface:
            old_context.makeCurrent(old_surface)
